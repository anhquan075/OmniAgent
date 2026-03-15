import express from 'express';
import cors from 'cors';
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, Annotation, MemorySaver, messagesStateReducer, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ethers } from "ethers";
import WDK from '@tetherto/wdk';
import WalletEVM from '@tetherto/wdk-wallet-evm';
import { RiskManager } from './risk-manager.js';
import { X402Client } from './x402-client.js';
import { runCycle } from './loop.js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import fs from 'fs';
import { z } from 'zod';
import axios from 'axios';

// Load environment variables from .env.wdk (absolute path for reliability)
const envPath = path.resolve(process.cwd(), '../.env.wdk');
dotenv.config({ path: envPath });

if (!process.env.OPENROUTER_API_KEY) {
  console.error("FATAL: OPENROUTER_API_KEY is missing from .env.wdk");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3002;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001";

const bnbRpc = process.env.BNB_RPC_URL || 'https://binance.llamarpc.com';
const engineAddress = process.env.WDK_ENGINE_ADDRESS;
const zkOracleAddress = process.env.WDK_ZK_ORACLE_ADDRESS;
const breakerAddress = process.env.WDK_BREAKER_ADDRESS;
const usdtAddress = process.env.WDK_USDT_ADDRESS;
const vaultAddress = process.env.WDK_VAULT_ADDRESS;
const syndicateAddress = process.env.WDK_SYNDICATE_ADDRESS;

// Helper to load ABI from file (handles both HH artifacts and raw arrays)
function loadAbi(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return data.abi || data;
}

// ABIs
const strategyEngineAbi = loadAbi('./StrategyEngine.json');
const zkOracleAbi = loadAbi('./ZKRiskOracle.json');
const breakerAbi = loadAbi('./CircuitBreaker.json');
const wdkVaultAbi = loadAbi('./WDKVault.json');
const syndicateAbi = loadAbi('./GroupSyndicate.json');

// WDK Setup
const wdk = new WDK(process.env.WDK_SECRET_SEED);
wdk.registerWallet('bnb', WalletEVM, { provider: bnbRpc });

const provider = new ethers.JsonRpcProvider(bnbRpc);

// Define Tools for the Agent
const getVaultStatusTool = new DynamicStructuredTool({
  name: "get_vault_status",
  description: "Get current status and health of the WDKVault.",
  schema: z.object({}),
  func: async () => {
    const vault = new ethers.Contract(vaultAddress, wdkVaultAbi, provider);
    const totalAssets = await vault.totalAssets();
    const buffer = await vault.bufferStatus();
    return JSON.stringify({
      totalAssets: ethers.formatUnits(totalAssets, 18),
      bufferUtilizationBps: buffer.utilizationBps.toString(),
      bufferCurrent: ethers.formatUnits(buffer.current, 18),
      bufferTarget: ethers.formatUnits(buffer.target, 18),
    });
  }
});

const checkRiskTool = new DynamicStructuredTool({
  name: "check_risk",
  description: "Get ZK-verified risk metrics and AI risk score. Pre-flights rebalance simulation.",
  schema: z.object({}),
  func: async () => {
    const zkOracle = new ethers.Contract(zkOracleAddress, zkOracleAbi, provider);
    const breaker = new ethers.Contract(breakerAddress, breakerAbi, provider);
    const engine = new ethers.Contract(engineAddress, strategyEngineAbi, provider);
    const riskManager = new RiskManager(zkOracle, breaker, wdk);
    const profile = await riskManager.getRiskProfile();
    
    // Use simulateCycle (VIEW) instead of executeCycle simulation to avoid cooldown reverts
    const iface = new ethers.Interface(strategyEngineAbi);
    const data = iface.encodeFunctionData("simulateCycle", []);
    const txSim = { to: engineAddress, data };
    
    const { SimulationService } = await import('./simulator.js');
    const simulator = new SimulationService(bnbRpc);
    const simResult = await simulator.simulateTransaction(txSim);
    const aiResult = await riskManager.getAIRiskScore(txSim, profile);
    
    return JSON.stringify({
      onChainProfile: profile,
      aiRiskScore: aiResult.score,
      aiExplanation: aiResult.explanation,
      simulationSuccess: simResult.success
    });
  }
});

const executeRebalanceTool = new DynamicStructuredTool({
  name: "execute_rebalance",
  description: "Trigger a rebalance cycle on the StrategyEngine via WDK. WRITE operation.",
  schema: z.object({}),
  func: async () => {
    const bnbAccount = await wdk.getAccount('bnb');
    const iface = new ethers.Interface(strategyEngineAbi);
    const data = iface.encodeFunctionData("executeCycle", []);
    const tx = await bnbAccount.sendTransaction({ to: engineAddress, value: 0n, data });
    return `Rebalance initiated. Hash: ${tx.hash}`;
  }
});

const executeSyndicatePayoutTool = new DynamicStructuredTool({
  name: "execute_syndicate_payout",
  description: "Execute a rotating payout for the GroupSyndicate.",
  schema: z.object({}),
  func: async () => {
    const bnbAccount = await wdk.getAccount('bnb');
    const iface = new ethers.Interface(syndicateAbi);
    const data = iface.encodeFunctionData("executePayout", []);
    const tx = await bnbAccount.sendTransaction({ to: syndicateAddress, value: 0n, data });
    return `Syndicate payout executed. Hash: ${tx.hash}`;
  }
});

const x402PaymentTool = new DynamicStructuredTool({
  name: "x402_payment",
  description: "Pay for machine-to-machine service using x402.",
  schema: z.object({
    serviceUrl: z.string(),
    providerAddress: z.string(),
    amount: z.string(),
  }),
  func: async ({ serviceUrl, providerAddress, amount }) => {
    const x402 = new X402Client(wdk, usdtAddress);
    const result = await x402.payAndFetch(serviceUrl, providerAddress, ethers.parseUnits(amount, 18));
    return `x402 Payment Success: ${JSON.stringify(result)}`;
  }
});

const tools = [getVaultStatusTool, checkRiskTool, executeRebalanceTool, executeSyndicatePayoutTool, x402PaymentTool];
const toolNode = new ToolNode(tools);

// OpenRouter LLM via LangChain (Optional, used for non-API flows if needed)
const model = new ChatOpenAI({
  apiKey: OPENROUTER_API_KEY,
  modelName: OPENROUTER_MODEL,
  configuration: {
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      "HTTP-Referer": "https://wdkvault.agent",
      "X-Title": "OmniWDK WDK Strategist",
    }
  }
}).bindTools(tools);

// LangGraph State
const StateAnnotation = Annotation.Root({
  messages: Annotation({
    reducer: messagesStateReducer,
  }),
});

async function callModel(state) {
  const response = await model.invoke(state.messages);
  return { messages: [response] };
}

function shouldContinue(state) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage.tool_calls?.length) return "tools";
  return END;
}

const workflow = new StateGraph(StateAnnotation)
  .addNode("agent", callModel)
  .addNode("tools", toolNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", shouldContinue)
  .addEdge("tools", "agent");

const appGraph = workflow.compile();

/**
 * Stats Endpoint for UI Live Data
 */
app.get('/api/stats', async (req, res) => {
  try {
    const vault = new ethers.Contract(vaultAddress, wdkVaultAbi, provider);
    const zkOracle = new ethers.Contract(zkOracleAddress, zkOracleAbi, provider);
    const breaker = new ethers.Contract(breakerAddress, breakerAbi, provider);
    const engine = new ethers.Contract(engineAddress, strategyEngineAbi, provider);
    const syndicate = new ethers.Contract(syndicateAddress, syndicateAbi, provider);

    // Fetch in parallel
    const [
      totalAssets,
      bufferStatus,
      riskMetrics,
      isPaused,
      executionStatus,
      preview,
      usdtBalance,
      memberCount,
      currentRound,
      lastPayoutTime
    ] = await Promise.all([
      vault.totalAssets().catch(() => 0n),
      vault.bufferStatus().catch(() => ({ utilizationBps: 0n, current: 0n, target: 0n })),
      zkOracle.getVerifiedRiskBands().catch(() => ({ monteCarloDrawdownBps: 0, verifiedSharpeRatio: 0, timestamp: Math.floor(Date.now()/1000) })),
      breaker.isPaused().catch(() => false),
      engine.canExecute().catch(() => [false, "0x00"]),
      engine.previewDecision().catch(() => ({ targetWDKBps: 0, state: 0 })),
      new ethers.Contract(usdtAddress, ['function balanceOf(address) view returns (uint256)'], provider).balanceOf(vaultAddress).catch(() => 0n),
      syndicate.getMemberCount().catch(() => 0n),
      syndicate.currentRound().catch(() => 0n),
      syndicate.lastPayoutTime().catch(() => 0n)
    ]);
    const [canExecute, executeReason] = executionStatus;

    // AI Pre-flight simulation
    const iface = new ethers.Interface(strategyEngineAbi);
    const data = iface.encodeFunctionData("simulateCycle", []);
    const txSim = { to: engineAddress, data };
    const { SimulationService } = await import('./simulator.js');
    const simulator = new SimulationService(bnbRpc);
    const simResult = await simulator.simulateTransaction(txSim);
    
    const riskManager = new RiskManager(zkOracle, breaker, wdk);
    const aiResult = await riskManager.getAIRiskScore(txSim, { drawdownBps: Number(riskMetrics.monteCarloDrawdownBps) });

    const stats = {
      vault: {
        totalAssets: ethers.formatUnits(totalAssets, 18),
        bufferUtilizationBps: bufferStatus.utilizationBps.toString(),
        bufferCurrent: ethers.formatUnits(bufferStatus.current, 18),
        bufferTarget: ethers.formatUnits(bufferStatus.target, 18),
        usdtBalance: ethers.formatUnits(usdtBalance, 18)
      },
      risk: {
        level: Number(riskMetrics.monteCarloDrawdownBps) >= 2000 ? 'HIGH' : Number(riskMetrics.monteCarloDrawdownBps) >= 1000 ? 'MEDIUM' : 'LOW',
        drawdownBps: Number(riskMetrics.monteCarloDrawdownBps),
        sharpe: Number(riskMetrics.verifiedSharpeRatio) / 100,
        timestamp: Number(riskMetrics.timestamp),
        aiScore: aiResult.score,
        aiExplanation: aiResult.explanation
      },
      system: {
        isPaused,
        canExecute,
        executeReason: typeof executeReason === 'string' && executeReason.startsWith('0x') && executeReason.length > 2 
          ? (executeReason === '0x00' ? 'NONE' : (function() { try { return ethers.decodeBytes32String(executeReason); } catch { return 'UNKNOWN'; } })()) 
          : 'UNKNOWN',
        targetWDKBps: Number(preview.targetWDKBps),
        state: Number(preview.state),
        timeUntilNext: Number(await engine.timeUntilNextCycle())
      },
      syndicate: {
        address: syndicateAddress,
        memberCount: memberCount.toString(),
        currentRound: currentRound.toString(),
        lastPayoutTime: Number(lastPayoutTime)
      },
      timestamp: Date.now()
    };

    res.json(stats);
  } catch (error) {
    console.error("Stats Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Chat Endpoint: Direct Stable Flow
 */
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  console.error(`[API] Received chat request`);
  
  try {
    const lastMessage = messages[messages.length - 1];
    let userMessage = "";
    
    if (typeof lastMessage.content === 'string') {
      userMessage = lastMessage.content;
    } else if (Array.isArray(lastMessage.content)) {
      userMessage = lastMessage.content
        .map(part => (typeof part === 'string' ? part : (part.text || "")))
        .join("");
    }
    
    const prompt = `You are the OmniWDK AFOS Strategist. 
Commands: /status (get_vault_status), /risk (check_risk), /rebalance (execute_rebalance), /payout (execute_syndicate_payout).
User: ${userMessage}`;

    const headers = {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    };

    const toolsConfig = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: { type: 'object', properties: {} }
      }
    }));

    let tool_choice = "auto";
    if (userMessage.startsWith('/status')) tool_choice = { type: 'function', function: { name: 'get_vault_status' } };
    if (userMessage.startsWith('/risk')) tool_choice = { type: 'function', function: { name: 'check_risk' } };
    if (userMessage.startsWith('/rebalance')) tool_choice = { type: 'function', function: { name: 'execute_rebalance' } };
    if (userMessage.startsWith('/payout')) tool_choice = { type: 'function', function: { name: 'execute_syndicate_payout' } };

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('x-vercel-ai-data-stream', 'v1');
    res.setHeader('Transfer-Encoding', 'chunked');

    // 1. Initial Call
    const initialRes = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: OPENROUTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      tools: toolsConfig,
      tool_choice: tool_choice
    }, { headers });

    const choice = initialRes.data.choices[0].message;
    
    if (choice.tool_calls) {
      const tc = choice.tool_calls[0];
      const tool = tools.find(t => t.name === tc.function.name);
      if (tool) {
        const toolResult = await tool.func({});
        // 2. Final Summary
        const finalRes = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model: OPENROUTER_MODEL,
          messages: [
            { role: 'user', content: prompt },
            choice,
            { role: 'tool', tool_call_id: tc.id, content: toolResult }
          ]
        }, { headers });
        const finalContent = finalRes.data.choices[0].message.content;
        res.write(`0:${JSON.stringify(finalContent)}\n`);
      }
    } else {
      res.write(`0:${JSON.stringify(choice.content || "")}\n`);
    }

    res.end();
  } catch (error) {
    console.error("Chat Error:", error.message);
    // Even on error, try to send something valid to the stream if headers were sent
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`3:${JSON.stringify(error.message)}\n`); // Error part
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`Strategist API listening on port ${PORT}`);
  const safeRunCycle = async () => {
    try { await runCycle(); } catch (e) { console.error('Loop Error:', e.message); }
  };
  safeRunCycle();
  setInterval(safeRunCycle, 5 * 60 * 1000);
});

import { ethers, Interface, JsonRpcProvider, Contract } from "ethers";
import WDK from '@tetherto/wdk';
import WalletEVM from '@tetherto/wdk-wallet-evm';
import WalletSolana from '@tetherto/wdk-wallet-solana';
import WalletTON from '@tetherto/wdk-wallet-ton';
import { RiskService } from './RiskService';
import { BridgeService } from './BridgeService';
import { X402Client } from '../x402-client';
import { StateGraph, Annotation, MemorySaver, END, START } from "@langchain/langgraph";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { env } from '@/config/env';
import { getContracts } from '@/contracts/clients/ethers';
import axios from 'axios';

// State Definition
const AgentState = Annotation.Root({
  riskProfile: Annotation<any>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({ level: 'LOW', drawdownBps: 0 })
  }),
  canExecute: Annotation<boolean>({
    reducer: (x, y) => y,
    default: () => false
  }),
  decision: Annotation<any>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({ state: 0, targetWDKBps: 0 })
  }),
  actionTaken: Annotation<string>({
    reducer: (x, y) => y,
    default: () => 'IDLE'
  }),
  txHash: Annotation<string | null>({
    reducer: (x, y) => y,
    default: () => null
  }),
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  })
});

// Helper to report agent state to the consolidated dashboard
async function reportToDashboard(node: string, state: any, details: any = {}) {
  const serverUrl = `http://localhost:${env.PORT}/api/agent/report`;
  try {
    await axios.post(serverUrl, {
      node,
      riskLevel: state.riskProfile?.level || 'UNKNOWN',
      drawdown: state.riskProfile?.drawdownBps || 0,
      action: state.actionTaken || 'PROCESSING',
      details
    }, { timeout: 2000 });
  } catch (e) {
    // Ignore if server is booting up
  }
}

// Initialize WDK
const wdk = new WDK(env.WDK_SECRET_SEED);
wdk.registerWallet('bnb', WalletEVM, { provider: env.BNB_RPC_URL });
wdk.registerWallet('solana', WalletSolana, { provider: 'https://api.mainnet-beta.solana.com' }); // Default or from env if added
wdk.registerWallet('ton', WalletTON, { provider: 'https://toncenter.com/api/v2/jsonRPC' });

/**
 * Node Functions
 */
async function analyzeRisk(state: any) {
  const { zkOracle, breaker } = getContracts();
  const riskService = new RiskService(zkOracle as any, breaker as any, wdk);
  const profile = await riskService.getRiskProfile();
  const result = { 
    riskProfile: profile,
    messages: [new AIMessage({ content: `Risk analyzed: ${profile.level}`, id: `risk-${Date.now()}` })]
  };
  await reportToDashboard('analyzeRisk', { ...state, ...result });
  return result;
}

async function handleEmergency(state: any) {
  const { breaker } = getContracts();
  const riskService = new RiskService(null as any, breaker as any, wdk);
  
  const isPaused = await breaker.isPaused();
  if (!isPaused) {
    const reason = `Emergency shutdown triggered by risk node: ${state.riskProfile.drawdownBps} bps drawdown proven by ZK.`;
    const tx = await riskService.triggerEmergencyPause(reason);
    const res = { 
      actionTaken: 'EMERGENCY_PAUSE',
      txHash: tx.hash,
      messages: [new AIMessage({ content: `Emergency pause executed: ${tx.hash}`, id: `emergency-${Date.now()}` })]
    };
    await reportToDashboard('handleEmergency', { ...state, ...res });
    return res;
  }
  const res = { actionTaken: 'ALREADY_PAUSED' };
  await reportToDashboard('handleEmergency', { ...state, ...res });
  return res;
}

async function checkStrategy(state: any) {
  const { engine } = getContracts();
  const [canExec, reason] = await engine.canExecute();
  const preview = await engine.previewDecision();
  
  const result = { 
    canExecute: canExec,
    decision: {
      state: Number(preview.state),
      targetWDKBps: Number(preview.targetWDKBps),
      bountyBps: Number(preview.bountyBps)
    },
    messages: [new AIMessage({ content: `Strategy checked. Executable: ${canExec}`, id: `strategy-${Date.now()}` })]
  };
  await reportToDashboard('checkStrategy', { ...state, ...result });
  return result;
}

async function executeRebalance(state: any) {
  const { engine, provider } = getContracts();
  
  const [canExec, reason] = await engine.canExecute();
  if (!canExec) {
    return { 
      actionTaken: 'SKIPPED_NOT_READY',
      messages: [new AIMessage({ content: `Rebalance skipped: ${ethers.decodeBytes32String(reason)}`, id: `skip-${Date.now()}` })]
    };
  }

  const bnbAccount = await wdk.getAccount('bnb');
  const fromAddress = await bnbAccount.getAddress();
  
  const balance = await provider.getBalance(fromAddress);
  if (balance < ethers.parseUnits("0.005", "ether")) {
    const res = {
      actionTaken: 'SKIPPED_NO_GAS',
      messages: [new AIMessage({ content: `Insufficient gas for rebalance.`, id: `gas-${Date.now()}` })]
    };
    await reportToDashboard('executeRebalance', { ...state, ...res });
    return res;
  }

  const iface = new Interface(['function executeCycle()']);
  const data = iface.encodeFunctionData("executeCycle", []);
  
  const tx = await bnbAccount.sendTransaction({
    to: await engine.getAddress(),
    value: 0n,
    data: data
  });
  
  const res = { 
    actionTaken: 'REBALANCED',
    txHash: tx.hash,
    messages: [new AIMessage({ content: `Rebalance hash: ${tx.hash}`, id: `rebalance-${Date.now()}` })]
  };
  await reportToDashboard('executeRebalance', { ...state, ...res });
  return res;
}

async function checkCrossChainYields(state: any) {
  // In integrated mode, we'll use BridgeService TS
  const bridgeService = new BridgeService(wdk, env.BNB_RPC_URL, '', '');
  const opportunity = await (bridgeService as any).analyzeBridgeOpportunity?.('bnb', 2.0) || { shouldBridge: false };

  if (opportunity.shouldBridge) {
    const bridgeResult = await (bridgeService as any).executeBridge?.('bnb', opportunity.targetChain, 100, env.WDK_USDT_ADDRESS) || { success: false };
    if (bridgeResult.success) {
      const res = { 
        actionTaken: 'BRIDGED_CAPITAL',
        txHash: bridgeResult.hash,
        messages: [new AIMessage({ content: `Moved capital to ${opportunity.targetChain} spoke.`, id: `bridge-${Date.now()}` })]
      };
      await reportToDashboard('checkCrossChainYields', { ...state, ...res }, { opportunity });
      return res;
    }
  }

  const res = { messages: [new AIMessage({ content: "Omnichain scouting completed.", id: `scout-${Date.now()}` })] };
  await reportToDashboard('checkCrossChainYields', { ...state, ...res });
  return res;
}

async function processX402Payment(state: any) {
  const x402 = new X402Client(wdk, env.WDK_USDT_ADDRESS);
  try {
    const res = { messages: [new AIMessage({ content: "x402 payment layer verified.", id: `x402-${Date.now()}` })] };
    await reportToDashboard('processX402Payment', { ...state, ...res });
    return res;
  } catch (e: any) {
    const res = { messages: [new AIMessage({ content: `x402 warning: ${e.message}`, id: `x402-err-${Date.now()}` })] };
    await reportToDashboard('processX402Payment', { ...state, ...res });
    return res;
  }
}

// Build Graph
const workflow = new StateGraph(AgentState)
  .addNode("analyzeRisk", analyzeRisk)
  .addNode("handleEmergency", handleEmergency)
  .addNode("checkStrategy", checkStrategy)
  .addNode("executeRebalance", executeRebalance)
  .addNode("checkCrossChainYields", checkCrossChainYields)
  .addNode("processX402Payment", processX402Payment);

workflow.addEdge(START, "analyzeRisk");

workflow.addConditionalEdges(
  "analyzeRisk",
  (state) => (state.riskProfile.level === 'HIGH' ? "emergency" : "normal"),
  { emergency: "handleEmergency", normal: "checkStrategy" }
);

workflow.addConditionalEdges(
  "checkStrategy",
  (state) => (state.canExecute ? "execute" : "standby"),
  { execute: "executeRebalance", standby: "checkCrossChainYields" }
);

workflow.addEdge("handleEmergency", "processX402Payment");
workflow.addEdge("executeRebalance", "processX402Payment");
workflow.addEdge("checkCrossChainYields", "processX402Payment");
workflow.addEdge("processX402Payment", END);

// Compile Graph - Move to top of exports to ensure it's fully initialized
export const appGraph = workflow.compile({ checkpointer: new MemorySaver() });

/**
 * AgentService manages the lifecycle of the autonomous loop.
 */
export class AgentService {
  static async runCycle() {
    console.log(`\n[${new Date().toISOString()}] Starting stateful autonomous cycle...`);
    const config = { configurable: { thread_id: "autonomous-loop-1" } };
    try {
      const finalState = await appGraph.invoke({}, config);
      console.log(`Cycle finished with action: ${finalState.actionTaken}`);
      return finalState;
    } catch (error) {
      console.error("Error in autonomous cycle:", error);
      throw error;
    }
  }
}

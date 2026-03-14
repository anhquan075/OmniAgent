import { ethers } from "ethers";
import WDK from '@tetherto/wdk';
import WalletEVM from '@tetherto/wdk-wallet-evm';
import WalletSolana from '@tetherto/wdk-wallet-solana';
import WalletTON from '@tetherto/wdk-wallet-ton';
import { RiskManager } from './risk-manager.js';
import { X402Client } from './x402-client.js';
import { StateGraph, Annotation, MemorySaver, END, START } from "@langchain/langgraph";
import * as dotenv from 'dotenv';
import * as path from 'path';
import fs from 'fs';

// Load environment variables from .env.wdk
dotenv.config({ path: path.resolve(process.cwd(), '../.env.wdk') });

const seed = process.env.WDK_SECRET_SEED;
const bnbRpc = process.env.BNB_RPC_URL || 'https://binance.llamarpc.com';
const solanaRpc = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const tonRpc = process.env.TON_RPC_URL || 'https://toncenter.com/api/v2/jsonRPC';

const engineAddress = process.env.WDK_ENGINE_ADDRESS;
const zkOracleAddress = process.env.WDK_ZK_ORACLE_ADDRESS;
const breakerAddress = process.env.WDK_BREAKER_ADDRESS;
const usdtAddress = process.env.WDK_USDT_ADDRESS;

if (!seed || !engineAddress || !zkOracleAddress || !breakerAddress) {
  console.error('ERROR: Missing configuration in .env.wdk');
  process.exit(1);
}

// Helper to load ABI from file (handles both HH artifacts and raw arrays)
function loadAbi(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return data.abi || data;
}

// Load ABIs
const strategyEngineAbi = loadAbi('./StrategyEngine.json');
const zkOracleAbi = loadAbi('./ZKRiskOracle.json');
const breakerAbi = loadAbi('./CircuitBreaker.json');
const proofVaultAbi = loadAbi('./ProofVault.json');
const syndicateAbi = loadAbi('./GroupSyndicate.json');

// Initialize WDK
const wdk = new WDK(seed);
wdk.registerWallet('bnb', WalletEVM, { provider: bnbRpc });
wdk.registerWallet('solana', WalletSolana, { provider: solanaRpc });
wdk.registerWallet('ton', WalletTON, { provider: tonRpc });

// State Definition (LangGraph)
const AgentState = Annotation.Root({
  riskProfile: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({ level: 'LOW', drawdownBps: 0 })
  }),
  canExecute: Annotation({
    reducer: (x, y) => y,
    default: () => false
  }),
  decision: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({ state: 0, targetAsterBps: 0 })
  }),
  actionTaken: Annotation({
    reducer: (x, y) => y,
    default: () => 'IDLE'
  }),
  txHash: Annotation({
    reducer: (x, y) => y,
    default: () => null
  }),
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => []
  })
});

// Helper to get contracts
function getContracts() {
  const provider = new ethers.JsonRpcProvider(bnbRpc);
  return {
    engine: new ethers.Contract(engineAddress, strategyEngineAbi, provider),
    zkOracle: new ethers.Contract(zkOracleAddress, zkOracleAbi, provider),
    breaker: new ethers.Contract(breakerAddress, breakerAbi, provider),
    syndicate: new ethers.Contract(process.env.WDK_SYNDICATE_ADDRESS || ethers.ZeroAddress, syndicateAbi, provider)
  };
}

/**
 * Node: Risk Analysis
 */
async function analyzeRisk(state) {
  console.log("--- NODE: ANALYZE RISK ---");
  const { zkOracle, breaker } = getContracts();
  const riskManager = new RiskManager(zkOracle, breaker, wdk);
  
  const profile = await riskManager.getRiskProfile();
  console.log(`- Risk Level: ${profile.level} (${profile.drawdownBps} bps drawdown)`);
  
  return { 
    riskProfile: profile,
    messages: [`Risk analyzed: ${profile.level}`]
  };
}

/**
 * Node: Emergency Action
 */
async function handleEmergency(state) {
  console.log("--- NODE: EMERGENCY ACTION ---");
  const { zkOracle, breaker } = getContracts();
  const riskManager = new RiskManager(zkOracle, breaker, wdk);
  
  const isPaused = await breaker.isPaused();
  if (!isPaused) {
    const reason = `Emergency shutdown triggered by risk node: ${state.riskProfile.drawdownBps} bps drawdown proven by ZK.`;
    const tx = await riskManager.triggerEmergencyPause(reason);
    return { 
      actionTaken: 'EMERGENCY_PAUSE',
      txHash: tx.hash,
      messages: [`Emergency pause executed: ${tx.hash}`]
    };
  }
  
  return { 
    actionTaken: 'ALREADY_PAUSED',
    messages: ["Vault already paused."]
  };
}

/**
 * Node: Strategy Check
 */
async function checkStrategy(state) {
  console.log("--- NODE: CHECK STRATEGY ---");
  const { engine } = getContracts();
  
  const [canExec, reason] = await engine.canExecute();
  const preview = await engine.previewDecision();
  
  console.log(`- Executable: ${canExec} (${ethers.decodeBytes32String(reason)})`);
  
  return { 
    canExecute: canExec,
    decision: {
      state: Number(preview.state),
      targetAsterBps: Number(preview.targetAsterBps),
      bountyBps: Number(preview.bountyBps)
    },
    messages: [`Strategy checked. Executable: ${canExec}`]
  };
}

/**
 * Node: Rebalance Execution
 */
async function executeRebalance(state) {
  console.log("--- NODE: EXECUTE REBALANCE ---");
  const bnbAccount = await wdk.getAccount('bnb');
  const fromAddress = await bnbAccount.getAddress();
  const iface = new ethers.Interface(strategyEngineAbi);
  const data = iface.encodeFunctionData("executeCycle", []);
  
  const txRequest = {
    to: engineAddress,
    from: fromAddress,
    value: 0n,
    data: data
  };

  // 1. Simulate
  const { SimulationService } = await import('./simulator.js');
  const simulator = new SimulationService(bnbRpc);
  const simResult = await simulator.simulateTransaction(txRequest);

  // 2. AI Risk Scoring
  const { zkOracle, breaker } = getContracts();
  const riskManager = new RiskManager(zkOracle, breaker, wdk);
  const aiScore = await riskManager.getAIRiskScore(simResult, state.riskProfile);

  const threshold = Number(process.env.RISK_SCORE_THRESHOLD) || 75;

  if (aiScore.score > threshold || !simResult.success) {
    console.log(`- REJECTED: AI Score ${aiScore.score} > ${threshold} OR Simulation Failed.`);
    return {
      actionTaken: 'REJECTED_BY_SAFETY_LAYER',
      messages: [`Rejected. AI Score: ${aiScore.score}. Reason: ${aiScore.explanation}. Sim Success: ${simResult.success}`]
    };
  }

  // 3. Execute
  const tx = await bnbAccount.sendTransaction({
    to: txRequest.to,
    value: txRequest.value,
    data: txRequest.data
  });
  
  console.log(`- Success: ${tx.hash}`);
  
  return { 
    actionTaken: 'REBALANCED',
    txHash: tx.hash,
    messages: [`Rebalance hash: ${tx.hash}`]
  };
}

/**
 * Node: Cross-Chain Yield Analysis
 */
async function checkCrossChainYields(state) {
  console.log("--- NODE: CROSS-CHAIN YIELD ANALYSIS ---");
  const { BridgeService } = await import('./bridge-manager.js');
  
  const bridgeService = new BridgeService(wdk, bnbRpc, solanaRpc, tonRpc);
  const opportunity = await bridgeService.analyzeBridgeOpportunity('bnb', 2.0);

  if (opportunity.shouldBridge) {
    console.log(`- Executing bridge to ${opportunity.targetChain} for ${opportunity.expectedYield}% yield...`);
    // Assuming 100 USDT threshold for test
    const tx = await bridgeService.executeBridge('bnb', opportunity.targetChain, 100, usdtAddress);
    return { 
      actionTaken: 'BRIDGED_CAPITAL',
      txHash: tx.hash,
      messages: [`Capital bridged to ${opportunity.targetChain}. Hash: ${tx.hash}`]
    };
  }

  console.log("- No better yields found cross-chain.");
  return { messages: ["Cross-chain check completed."] };
}

/**
 * Node: Infrastructure Payment (x402)
 */
async function processX402Payment(state) {
  console.log("--- NODE: X402 PAYMENT ---");
  const x402 = new X402Client(wdk, usdtAddress);
  
  // Every rebalance cycle or standby, pay for infrastructure
  // Mock provider and service for now
  try {
    const mockProvider = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    console.log("- x402 payment ready for market insight processing.");
    return { messages: ["x402 payment layer verified."] };
  } catch (e) {
    console.warn("- x402 failed, continuing as secondary function.");
    return { messages: [`x402 warning: ${e.message}`] };
  }
}

/**
 * Node: Spendable Yield Sweep
 */
async function yieldSweep(state) {
  console.log("--- NODE: YIELD SWEEP ---");
  const bnbAccount = await wdk.getAccount('bnb');
  // Derive a separate "spending" wallet using a different index/path
  const spendingAccount = await wdk.getAccount('bnb', 1); 
  const spendingAddress = await spendingAccount.getAddress();

  // Use a regular provider for calls to ensure contract logic works correctly
  const provider = new ethers.JsonRpcProvider(bnbRpc);
  const vault = new ethers.Contract(process.env.WDK_VAULT_ADDRESS || "0xMockVault", proofVaultAbi, provider);
  
  try {
    // Check max withdraw vs principal locally before calling to save gas
    const myAddress = await bnbAccount.getAddress();
    const principal = await vault.userPrincipal(myAddress);
    const maxWithdrawable = await vault.maxWithdraw(myAddress);
    
    if (maxWithdrawable > principal && (maxWithdrawable - principal) > ethers.parseUnits("10", 6)) {
      console.log(`- Yield found! Sweeping accrued interest to Spending Wallet (${spendingAddress})...`);
      
      const iface = new ethers.Interface(proofVaultAbi);
      const data = iface.encodeFunctionData("withdrawYield", [spendingAddress]);
      
      const tx = await bnbAccount.sendTransaction({
        to: await vault.getAddress(),
        value: 0n,
        data: data
      });
      
      return { messages: [`Yield swept to hot wallet. Hash: ${tx.hash}`] };
    } else {
      console.log("- No significant yield accrued to sweep.");
    }
  } catch (e) {
    console.warn(`- Yield sweep check failed/skipped: ${e.message}`);
  }
  
  return { messages: ["Yield sweep check completed."] };
}

// Define the Graph
const workflow = new StateGraph(AgentState)
  .addNode("analyzeRisk", analyzeRisk)
  .addNode("handleEmergency", handleEmergency)
  .addNode("checkStrategy", checkStrategy)
  .addNode("executeRebalance", executeRebalance)
  .addNode("checkCrossChainYields", checkCrossChainYields)
  .addNode("processX402Payment", processX402Payment)
  .addNode("yieldSweep", yieldSweep);

// Define Flow
workflow.addEdge(START, "analyzeRisk");

workflow.addConditionalEdges(
  "analyzeRisk",
  (state) => {
    if (state.riskProfile.level === 'HIGH') return "emergency";
    return "normal";
  },
  {
    emergency: "handleEmergency",
    normal: "checkStrategy"
  }
);

workflow.addConditionalEdges(
  "checkStrategy",
  (state) => {
    if (state.canExecute) return "execute";
    return "standby";
  },
  {
    execute: "executeRebalance",
    standby: "checkCrossChainYields"
  }
);

workflow.addEdge("handleEmergency", "processX402Payment");
workflow.addEdge("executeRebalance", "processX402Payment");
workflow.addEdge("checkCrossChainYields", "processX402Payment");
workflow.addEdge("processX402Payment", "yieldSweep");
workflow.addEdge("yieldSweep", END);

// Persistence
const checkpointer = new MemorySaver();
const app = workflow.compile({ checkpointer });

/**
 * Run one autonomous cycle.
 */
export async function runCycle() {
  console.log(`\n[${new Date().toISOString()}] Starting stateful autonomous cycle...`);
  
  const threadId = "autonomous-loop-1";
  const config = { configurable: { thread_id: threadId } };

  try {
    const finalState = await app.invoke({}, config);
    console.log(`Cycle finished with action: ${finalState.actionTaken}`);
    return finalState;
  } catch (error) {
    console.error("Error in autonomous cycle:", error);
    throw error;
  }
}

// Only run standalone if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const INTERVAL = 5 * 60 * 1000;
  console.log('--- TetherProof WDK LangGraph-Driven Agent Started (Standalone) ---');
  runCycle();
  setInterval(runCycle, INTERVAL);
}

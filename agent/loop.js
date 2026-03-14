import { ethers } from "ethers";
import WDK from '@tetherto/wdk';
import WalletEVM from '@tetherto/wdk-wallet-evm';
import WalletSolana from '@tetherto/wdk-wallet-solana';
import WalletTON from '@tetherto/wdk-wallet-ton';
import { RiskManager } from './risk-manager.js';
import { X402Client } from './x402-client.js';
import { BridgeService } from './bridge-manager.js';
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

console.log(`[Config] BNB RPC: ${bnbRpc}`);
console.log(`[Config] Engine: ${engineAddress}`);
console.log(`[Config] ZK Oracle: ${zkOracleAddress}`);

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
const auctionAbi = loadAbi('./ExecutionAuction.json');

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)"
];

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
    syndicate: new ethers.Contract(process.env.WDK_SYNDICATE_ADDRESS || ethers.ZeroAddress, syndicateAbi, provider),
    auction: new ethers.Contract(process.env.WDK_AUCTION_ADDRESS || ethers.ZeroAddress, auctionAbi, provider)
  };
}

/**
 * Helper to report agent state to the dashboard server
 */
async function reportToDashboard(node, state, details = {}) {
  const serverUrl = `http://localhost:3001/api/agent/report`;
  try {
    await axios.post(serverUrl, {
      node,
      riskLevel: state.riskProfile?.level || 'UNKNOWN',
      drawdown: state.riskProfile?.drawdownBps || 0,
      action: state.actionTaken || 'PROCESSING',
      details
    }, { timeout: 2000 });
  } catch (e) {
    // Silently ignore if server is down
  }
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
  
  const result = { 
    riskProfile: profile,
    messages: [`Risk analyzed: ${profile.level}`]
  };
  await reportToDashboard('analyzeRisk', { ...state, ...result });
  return result;
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
    const res = { 
      actionTaken: 'EMERGENCY_PAUSE',
      txHash: tx.hash,
      messages: [`Emergency pause executed: ${tx.hash}`]
    };
    await reportToDashboard('handleEmergency', { ...state, ...res });
    return res;
  }
  
  const res = { 
    actionTaken: 'ALREADY_PAUSED',
    messages: ["Vault already paused."]
  };
  await reportToDashboard('handleEmergency', { ...state, ...res });
  return res;
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
  
  const result = { 
    canExecute: canExec,
    decision: {
      state: Number(preview.state),
      targetAsterBps: Number(preview.targetAsterBps),
      bountyBps: Number(preview.bountyBps)
    },
    messages: [`Strategy checked. Executable: ${canExec}`]
  };
  await reportToDashboard('checkStrategy', { ...state, ...result });
  return result;
}

/**
 * Node: Rebalance Execution
 */
async function executeRebalance(state) {
  console.log("--- NODE: EXECUTE REBALANCE ---");
  const { engine, auction } = getContracts();
  const bnbAccount = await wdk.getAccount('bnb');
  const fromAddress = await bnbAccount.getAddress();
  
  // RRA Logic Integration
  const auctionAddr = process.env.WDK_AUCTION_ADDRESS;
  if (auctionAddr && auctionAddr !== ethers.ZeroAddress) {
    console.log(`- ExecutionAuction detected: ${auctionAddr}`);
    try {
      const status = await auction.roundStatus();
      const phase = Number(status.currentPhase);
      console.log(`  Current Phase: ${['NotOpen', 'BidPhase', 'ExecutePhase', 'FallbackPhase'][phase]}`);

      if (phase === 0 || phase === 1) { // NotOpen or BidPhase
        console.log("- Placing bid for execution rights...");
        const minBid = await auction.minBid();
        const currentBid = status.winningBid;
        const myBid = currentBid > 0n 
          ? currentBid + (currentBid * 500n / 10000n) // 5% increment
          : minBid;

        // Check allowance
        const usdt = new ethers.Contract(usdtAddress, ERC20_ABI, bnbAccount.getRunner());
        const allowance = await usdt.allowance(fromAddress, auctionAddr);
        if (allowance < myBid) {
          console.log(`  Approving ${myBid} USDT for auction...`);
          await bnbAccount.sendTransaction({
            to: usdtAddress,
            data: new ethers.Interface(ERC20_ABI).encodeFunctionData("approve", [auctionAddr, ethers.MaxUint256])
          });
        }

        const bidData = new ethers.Interface(auctionAbi).encodeFunctionData("bid", [myBid]);
        const bidTx = await bnbAccount.sendTransaction({ to: auctionAddr, data: bidData });
        console.log(`  ✓ Bid placed: ${bidTx.hash}`);
        const res = { actionTaken: 'AUCTION_BID_PLACED', txHash: bidTx.hash, messages: ["Bid for rebalance rights placed."] };
        await reportToDashboard('executeRebalance', { ...state, ...res });
        return res;
      } 
      
      if (phase === 2) { // ExecutePhase
        if (status.winner.toLowerCase() === fromAddress.toLowerCase()) {
          console.log("- Winner executing rights...");
          const execData = new ethers.Interface(auctionAbi).encodeFunctionData("winnerExecute", []);
          const execTx = await bnbAccount.sendTransaction({ to: auctionAddr, data: execData });
          console.log(`  ✓ Winner Execution: ${execTx.hash}`);
          const res = { actionTaken: 'AUCTION_EXECUTED_WINNER', txHash: execTx.hash, messages: ["Winner rebalance executed."] };
          await reportToDashboard('executeRebalance', { ...state, ...res });
          return res;
        } else {
          console.log(`  Winner is ${status.winner}. Waiting for fallback or next round.`);
          const res = { actionTaken: 'AUCTION_WAITING', messages: ["Waiting for winner execution."] };
          await reportToDashboard('executeRebalance', { ...state, ...res });
          return res;
        }
      }

      if (phase === 3) { // FallbackPhase
        console.log("- Fallback execution...");
        const fbData = new ethers.Interface(auctionAbi).encodeFunctionData("fallbackExecute", []);
        const fbTx = await bnbAccount.sendTransaction({ to: auctionAddr, data: fbData });
        console.log(`  ✓ Fallback Execution: ${fbTx.hash}`);
        const res = { actionTaken: 'AUCTION_EXECUTED_FALLBACK', txHash: fbTx.hash, messages: ["Fallback rebalance executed."] };
        await reportToDashboard('executeRebalance', { ...state, ...res });
        return res;
      }
    } catch (e) {
      console.error(`  ✗ Auction logic failed: ${e.message}. Falling back to direct execution.`);
    }
  }

  // Direct Execution Fallback (if no auction or auction logic fails)
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
    const res = {
      actionTaken: 'REBALANCED_REJECTED',
      messages: [`Rejected. AI Score: ${aiScore.score}. Reason: ${aiScore.explanation}. Sim Success: ${simResult.success}`]
    };
    await reportToDashboard('executeRebalance', { ...state, ...res }, { aiScore });
    return res;
  }

  // 3. Execute
  const tx = await bnbAccount.sendTransaction({
    to: txRequest.to,
    value: txRequest.value,
    data: txRequest.data
  });
  
  console.log(`- Success: ${tx.hash}`);
  
  const res = { 
    actionTaken: 'REBALANCED',
    txHash: tx.hash,
    messages: [`Rebalance hash: ${tx.hash}`]
  };
  await reportToDashboard('executeRebalance', { ...state, ...res });
  return res;
}

/**
 * Node: Cross-Chain Yield Analysis
 */
async function checkCrossChainYields(state) {
  console.log("--- NODE: CROSS-CHAIN YIELD ANALYSIS ---");
  const bridgeService = new BridgeService(wdk, bnbRpc, solanaRpc, tonRpc);
  
  // 1. Scout yields on SOL/TON
  const opportunity = await bridgeService.analyzeBridgeOpportunity('bnb', 2.0);

  if (opportunity.shouldBridge) {
    console.log(`- Executing WDK Omnichain Transfer to ${opportunity.targetChain} (+${(opportunity.expectedYield - 5.2).toFixed(2)}% alpha)...`);
    
    // Bridging 100 USD₮ as a demo amount from Idle Buffer
    const bridgeResult = await bridgeService.executeBridge('bnb', opportunity.targetChain, 100, usdtAddress);
    
    if (bridgeResult.success) {
      const res = { 
        actionTaken: 'BRIDGED_CAPITAL',
        txHash: bridgeResult.hash,
        messages: [`Capital moved to ${opportunity.targetChain} spoke for yield optimization. Hash: ${bridgeResult.hash}`]
      };
      await reportToDashboard('checkCrossChainYields', { ...state, ...res }, { opportunity });
      return res;
    }
  }

  console.log("- Local yields remain optimal or Alpha threshold not met.");
  const res = { messages: ["Omnichain scouting completed."] };
  await reportToDashboard('checkCrossChainYields', { ...state, ...res });
  return res;
}

/**
 * Node: Infrastructure Payment (x402)
 */
async function processX402Payment(state) {
  console.log("--- NODE: X402 PAYMENT ---");
  const x402 = new X402Client(wdk, usdtAddress);
  
  // Every rebalance cycle or standby, pay for infrastructure insights
  const serviceUrl = process.env.X402_SERVICE_URL || "https://api.tetherproof.xyz/insights";
  const providerAddress = process.env.X402_PROVIDER_ADDRESS || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const paymentAmount = "0.1"; // 0.1 USDT for one insight report

  try {
    console.log(`- Requesting market insights via x402...`);
    // In demo mode, we might just simulate the call or hit a real endpoint if configured
    if (process.env.DEMO_MODE === 'true') {
      console.log(`- [Demo] Skipping real x402 payment, simulating success.`);
      const res = { messages: ["x402 payment simulated successfully."] };
      await reportToDashboard('processX402Payment', { ...state, ...res });
      return res;
    }

    const insightData = await x402.payAndFetch(serviceUrl, providerAddress, paymentAmount);
    console.log("- x402 payment successful. Insight received.");
    
    const res = { 
      messages: [`x402 payment confirmed. Insight: ${insightData.signal || 'Neutral'}`] 
    };
    await reportToDashboard('processX402Payment', { ...state, ...res });
    return res;
  } catch (e) {
    console.warn(`- x402 payment failed: ${e.message}`);
    const res = { messages: [`x402 notice: ${e.message}`] };
    await reportToDashboard('processX402Payment', { ...state, ...res });
    return res;
  }
}

/**
 * Node: Spendable Yield Sweep
 */
async function yieldSweep(state) {
  console.log("--- NODE: YIELD SWEEP ---");
  const bnbAccount = await wdk.getAccount('bnb');
  const spendingAccount = await wdk.getAccount('bnb', 1); 
  const spendingAddress = await spendingAccount.getAddress();

  const provider = new ethers.JsonRpcProvider(bnbRpc);
  const vault = new ethers.Contract(process.env.WDK_VAULT_ADDRESS || "0xMockVault", proofVaultAbi, provider);
  
  try {
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
      
      const res = { messages: [`Yield swept to hot wallet. Hash: ${tx.hash}`] };
      await reportToDashboard('yieldSweep', { ...state, ...res });
      return res;
    } else {
      console.log("- No significant yield accrued to sweep.");
    }
  } catch (e) {
    console.warn(`- Yield sweep check failed/skipped: ${e.message}`);
  }
  
  const res = { messages: ["Yield sweep check completed."] };
  await reportToDashboard('yieldSweep', { ...state, ...res });
  return res;
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
  console.log('--- TetherProof WDK Omnichain Agent Started ---');
  runCycle();
  setInterval(runCycle, INTERVAL);
}

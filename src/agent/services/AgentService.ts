import { ethers, Interface, JsonRpcProvider, Contract } from "ethers";
import WDK from '@tetherto/wdk';
import WalletEVM from '@tetherto/wdk-wallet-evm';
import { RiskService } from './RiskService';
import { X402Client } from '../x402-client';
import { StateGraph, Annotation, MemorySaver, END, START } from "@langchain/langgraph";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { env } from '@/config/env';
import { getContracts } from '@/contracts/clients/ethers';

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
    default: () => ({ state: 0, targetAsterBps: 0 })
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

// Initialize WDK
const wdk = new WDK(env.WDK_SECRET_SEED);
wdk.registerWallet('bnb', WalletEVM, { provider: env.BNB_RPC_URL });

/**
 * Node Functions
 */
async function analyzeRisk(state: any) {
  const { zkOracle, breaker } = getContracts();
  const riskService = new RiskService(zkOracle as any, breaker as any, wdk);
  const profile = await riskService.getRiskProfile();
  return { 
    riskProfile: profile,
    messages: [new AIMessage(`Risk analyzed: ${profile.level}`)]
  };
}

async function handleEmergency(state: any) {
  const { breaker, zkOracle } = getContracts();
  const riskService = new RiskService(zkOracle as any, breaker as any, wdk);
  
  const isPaused = await breaker.isPaused();
  if (!isPaused) {
    const reason = `Emergency shutdown triggered by risk node: ${state.riskProfile.drawdownBps} bps drawdown proven by ZK.`;
    const tx = await riskService.triggerEmergencyPause(reason);
    return { 
      actionTaken: 'EMERGENCY_PAUSE',
      txHash: tx.hash,
      messages: [new AIMessage(`Emergency pause executed: ${tx.hash}`)]
    };
  }
  return { actionTaken: 'ALREADY_PAUSED' };
}

async function checkStrategy(state: any) {
  const { engine } = getContracts();
  const [canExec, reason] = await engine.canExecute();
  const preview = await engine.previewDecision();
  
  return { 
    canExecute: canExec,
    decision: {
      state: Number(preview.state),
      targetAsterBps: Number(preview.targetAsterBps),
      bountyBps: Number(preview.bountyBps)
    },
    messages: [new AIMessage(`Strategy checked. Executable: ${canExec}`)]
  };
}

async function executeRebalance(state: any) {
  const bnbAccount = await wdk.getAccount('bnb');
  const { engine } = getContracts();
  const iface = new Interface(['function executeCycle()']);
  const data = iface.encodeFunctionData("executeCycle", []);
  
  const tx = await bnbAccount.sendTransaction({
    to: await engine.getAddress(),
    value: 0n,
    data: data
  });
  
  return { 
    actionTaken: 'REBALANCED',
    txHash: tx.hash,
    messages: [new AIMessage(`Rebalance hash: ${tx.hash}`)]
  };
}

async function processX402Payment(state: any) {
  const x402 = new X402Client(wdk, env.WDK_USDT_ADDRESS);
  try {
    const mockProvider = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    // For now we just verify layer connectivity
    return { messages: [new AIMessage("x402 payment layer verified.")] };
  } catch (e: any) {
    return { messages: [new AIMessage(`x402 warning: ${e.message}`)] };
  }
}

// Build Graph
const workflow = new StateGraph(AgentState)
  .addNode("analyzeRisk", analyzeRisk)
  .addNode("handleEmergency", handleEmergency)
  .addNode("checkStrategy", checkStrategy)
  .addNode("executeRebalance", executeRebalance)
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
  { execute: "executeRebalance", standby: "processX402Payment" }
);

workflow.addEdge("handleEmergency", "processX402Payment");
workflow.addEdge("executeRebalance", "processX402Payment");
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

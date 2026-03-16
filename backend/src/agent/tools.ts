import { ethers, Interface, Contract } from "ethers";
import WDK from '@tetherto/wdk';
import WalletEVM from '@tetherto/wdk-wallet-evm';
import WalletSolana from '@tetherto/wdk-wallet-solana';
import WalletTON from '@tetherto/wdk-wallet-ton';
import { RiskService } from './services/RiskService';
import { BridgeService } from './services/BridgeService';
import { SimulationService } from './services/SimulationService';
import { X402Client } from './x402-client';
import { getPolicyGuard } from './middleware/PolicyGuard';
import { createProfitSimulator } from './services/ProfitSimulator';
import { tool } from "ai";
import { z } from "zod";
import { env } from '@/config/env';
import { getContracts } from '@/contracts/clients/ethers';
import axios from 'axios';

// Initialize WDK
export const wdk = new WDK(env.WDK_SECRET_SEED);
wdk.registerWallet('bnb', WalletEVM, { provider: env.BNB_RPC_URL } as any);
wdk.registerWallet('solana', WalletSolana, { rpcUrl: 'https://api.mainnet-beta.solana.com' } as any);
wdk.registerWallet('ton', WalletTON, { rpcUrl: 'https://toncenter.com/api/v2/jsonRPC' } as any);

const { engine, vault, usdt, zkOracle, breaker, auction } = getContracts();
const bridgeService = new BridgeService(wdk);
const x402 = new X402Client(wdk, env.WDK_USDT_ADDRESS);
const profitSimulator = createProfitSimulator(env.BNB_RPC_URL);
const policyGuard = getPolicyGuard();


// Helper to report agent state
async function reportToDashboard(node: string, details: any = {}) {
  const serverUrl = `http://localhost:${env.PORT}/api/agent/report`;
  try {
    await axios.post(serverUrl, {
      node,
      riskLevel: details.riskLevel || 'UNKNOWN',
      drawdown: details.drawdown || 0,
      action: details.action || 'PROCESSING',
      details
    }, { timeout: 2000 });
  } catch (e) {}
}

/**
 * Agent Tools Definition
 */
export const agentTools = {
  get_vault_status: tool({
    description: 'Get current status, total assets, health, and buffer utilization of the WDKVault.',
    parameters: z.object({
      context: z.string().describe('Reason/context for this action.')
    }),
    // @ts-ignore
    execute: async ({ context }: { context: string }) => {
      try {
        const assets = await vault.totalAssets();
        
        // Determine token decimals
        let tokenDecimals = 6;
        try {
          tokenDecimals = await usdt.decimals();
        } catch (e) {
          // Fallback to 6 for USDT if decimals call fails
        }

        // Get buffer status
        let bufferUtilizationBps = 0;
        let bufferCurrent = 0;
        let bufferTarget = 0;
        try {
          const buffer = await vault.bufferStatus();
          // Buffer status returns (uint256 bufferTarget, uint256 idleBalance, uint256 utilizationBps)
          const targetRaw = buffer.bufferTarget ?? buffer[0] ?? 0n;
          const currentRaw = buffer.idleBalance ?? buffer[1] ?? 0n;
          const utilizationRaw = buffer.utilizationBps ?? buffer[2] ?? 0n;

          bufferTarget = Number(ethers.formatUnits(targetRaw, tokenDecimals));
          bufferCurrent = Number(ethers.formatUnits(currentRaw, tokenDecimals));
          bufferUtilizationBps = Number(utilizationRaw);
        } catch (e) {
          console.warn("Could not fetch buffer status:", e);
        }

        const res = {
          vault: await vault.getAddress(),
          totalAssets: ethers.formatUnits(assets, tokenDecimals),
          bufferUtilizationBps,
          bufferCurrent,
          bufferTarget,
          status: "Healthy",
          assetSymbol: "USD₮"
        };
        await reportToDashboard('getVaultStatus', res);
        return res;
      } catch (e: any) {
        return { error: "Failed to fetch vault assets", message: e.message };
      }
    },
  }),

  analyze_risk: tool({
    description: 'Analyze the current ZK-risk parameters and return the risk profile level (LOW, MEDIUM, HIGH) and drawdown bps.',
    parameters: z.object({
      context: z.string().describe('Reason/context for this action.')
    }),
    // @ts-ignore
    execute: async ({ context }: { context: string }) => {
      const riskService = new RiskService(zkOracle as any, breaker as any, wdk);
      const profile = await riskService.getRiskProfile();
      await reportToDashboard('analyzeRisk', { riskLevel: profile.level, drawdown: profile.drawdownBps, ...profile });
      return profile;
    },
  }),

  handle_emergency: tool({
    description: 'Execute an emergency shutdown/pause of the vault if high risk is detected.',
    parameters: z.object({
      reason: z.string().describe('The reason for the emergency shutdown.')
    }),
    // @ts-ignore
    execute: async ({ reason }: { reason: string }) => {
      const riskService = new RiskService(null as any, breaker as any, wdk);
      
      const isPaused = await breaker.isPaused();
      if (!isPaused) {
        const tx = await riskService.triggerEmergencyPause(reason);
        const res = { actionTaken: 'EMERGENCY_PAUSE', txHash: tx.hash };
        await reportToDashboard('handleEmergency', res);
        return res;
      }
      return { actionTaken: 'ALREADY_PAUSED' };
    },
  }),

  check_strategy: tool({
    description: 'Check if the strategy engine is ready for a rebalance cycle and preview the next decision.',
    parameters: z.object({
      context: z.string().describe('Reason/context for this action.')
    }),
    // @ts-ignore
    execute: async ({ context }: { context: string }) => {
      const [canExec, reason] = await engine.canExecute();
      const preview = await engine.previewDecision();
      
      const res = { 
        canExecute: canExec,
        reason: canExec ? '' : (function() { try { return ethers.decodeBytes32String(reason); } catch { return 'UNKNOWN'; } })(),
        decision: {
          state: Number(preview.state),
          targetWDKBps: Number(preview.targetWDKBps),
          bountyBps: Number(preview.bountyBps)
        }
      };
      await reportToDashboard('checkStrategy', res);
      return res;
    },
  }),

  execute_rebalance: tool({
    description: 'Execute a tactical rebalance cycle. Handles Auction bidding if active, simulation, and AI risk scoring.',
    parameters: z.object({
      context: z.string().describe('Reason/context for this action.')
    }),
    // @ts-ignore
    execute: async ({ context }: { context: string }) => {
      const bnbAccount = await wdk.getAccount('bnb');
      const fromAddress = await bnbAccount.getAddress();

      const riskService = new RiskService(zkOracle as any, breaker as any, wdk);
      const profile = await riskService.getRiskProfile();

      const policyViolation = policyGuard.validateSwapTransaction({
        fromToken: env.WDK_USDT_ADDRESS,
        toToken: env.WDK_ENGINE_ADDRESS,
        amount: '100000000',
        currentRiskLevel: profile.level as any,
        portfolioValue: (await vault.totalAssets()).toString(),
        estimatedSlippageBps: 100,
      });

      if (policyViolation.violated) {
        console.warn(`[Rebalance] Policy violation: ${policyViolation.reason}`);
        await reportToDashboard('executeRebalance', {
          actionTaken: 'BLOCKED_BY_POLICY',
          reason: policyViolation.reason,
          severity: policyViolation.severity,
        });
        return {
          actionTaken: 'BLOCKED_BY_POLICY',
          reason: policyViolation.reason,
          severity: policyViolation.severity,
        };
      }

      // 1. Check Auction logic
      if (await auction.getAddress() !== ethers.ZeroAddress) {
        try {
          const status = await (auction as any).roundStatus();
          const phase = Number(status.currentPhase);
          
          if (phase === 1) { // BidPhase
            const minBid = await (auction as any).minBid();
            const currentBid = status.winningBid;
            const myBid = currentBid > 0n ? currentBid + (currentBid * 500n / 10000n) : minBid;

            const allowance = await usdt.allowance(fromAddress, await auction.getAddress());
            if (allowance < myBid) {
              await bnbAccount.sendTransaction({
                to: env.WDK_USDT_ADDRESS,
                data: usdt.interface.encodeFunctionData("approve", [await auction.getAddress(), ethers.MaxUint256])
              } as any);
            }

            const bidTx = await bnbAccount.sendTransaction({
              to: await auction.getAddress(),
              data: auction.interface.encodeFunctionData("bid", [myBid])
            } as any);
            return { actionTaken: 'AUCTION_BID_PLACED', txHash: bidTx.hash };
          } 
          
          if (phase === 2 && status.winner.toLowerCase() === fromAddress.toLowerCase()) {
            const execTx = await bnbAccount.sendTransaction({
              to: await auction.getAddress(),
              data: auction.interface.encodeFunctionData("winnerExecute", [])
            } as any);
            return { actionTaken: 'AUCTION_EXECUTED_WINNER', txHash: execTx.hash };
          }
        } catch (e) {}
      }

      // 2. Direct Execution with Simulation & AI Scoring
      const [canExec, reason] = await engine.canExecute();
      if (!canExec) return { actionTaken: 'SKIPPED_NOT_READY' };

      const txRequest = {
        to: await engine.getAddress(),
        from: fromAddress,
        data: engine.interface.encodeFunctionData("executeCycle", []),
        value: 0n
      };

      const simulator = new SimulationService(env.BNB_RPC_URL);
      const simResult = await simulator.simulateTransaction(txRequest);

      const aiScore = await riskService.getAIRiskScore(simResult, profile);

      if (aiScore.score > 75 || !simResult.success) {
        return { actionTaken: 'REJECTED_BY_AI', score: aiScore.score, reason: aiScore.explanation };
      }

      // Simulate profitability
      const portfolioValue = await vault.totalAssets();
      const profitSim = await profitSimulator.simulateRebalance({
        portfolioValue: portfolioValue.toString(),
        currentAllocation: { engine: 50, vault: 50 },
        targetAllocation: { engine: 40, vault: 60 },
        estimatedGasPerSwap: '1000000',
      });

      console.log(`[Rebalance] Profit simulation: ${JSON.stringify(profitSim)}`);

      const tx = await bnbAccount.sendTransaction({
        to: txRequest.to,
        data: txRequest.data,
        value: txRequest.value
      } as any);

      policyGuard.recordTransaction('100000000');

      const res = { actionTaken: 'REBALANCED', txHash: tx.hash, profitSimulation: profitSim };
      await reportToDashboard('executeRebalance', res);
      return res;
    },
  }),

  check_cross_chain_yields: tool({
    description: 'Scout yields across BNB, Solana, and TON and move capital if an opportunity exists.',
    parameters: z.object({
      threshold: z.number().default(2.0).describe('Minimum yield premium to trigger a bridge.')
    }),
    // @ts-ignore
    execute: async ({ threshold }: { threshold: number }) => {
      const riskService = new RiskService(zkOracle as any, breaker as any, wdk);
      const profile = await riskService.getRiskProfile();

      const policyViolation = policyGuard.validateBridgeTransaction({
        fromChain: 'bnb',
        toChain: 'solana',
        amount: '100000000',
        currentRiskLevel: profile.level as any,
        portfolioValue: (await vault.totalAssets()).toString(),
      });

      if (policyViolation.violated) {
        console.warn(`[Bridge] Policy violation: ${policyViolation.reason}`);
        return { actionTaken: 'BLOCKED_BY_POLICY', reason: policyViolation.reason };
      }

      const opportunity = await bridgeService.analyzeBridgeOpportunity('bnb', threshold);

      if (opportunity.shouldBridge) {
        const currentYield = 0;
        const expectedYieldDifference = (opportunity.expectedYield || 2.0) - currentYield;
        
        const profitSim = await profitSimulator.simulateBridge({
          inputAmount: '100000000',
          fromChain: 'bnb',
          toChain: opportunity.targetChain || 'solana',
          expectedYieldDifference: expectedYieldDifference,
          holdingPeriodDays: 30,
        });

        if (!profitSim.isViable) {
          console.log(`[Bridge] Not viable: ${profitSim.profitMargin}% margin`);
          return { actionTaken: 'SKIPPED_NOT_PROFITABLE', profitMargin: profitSim.profitMargin };
        }

        const bridgeResult = await bridgeService.executeBridge('bnb', opportunity.targetChain || '', 100);
        if (bridgeResult.success) {
          policyGuard.recordTransaction('100000000');
          const res = { actionTaken: 'BRIDGED_CAPITAL', txHash: bridgeResult.hash, profitSimulation: profitSim };
          await reportToDashboard('checkCrossChainYields', { ...res, opportunity });
          return res;
        }
      }
      return { actionTaken: 'SCOUTING_COMPLETED', message: "Omnichain scouting completed." };
    },
  }),

  process_x402_payment: tool({
    description: 'Pay for infrastructure insights using x402 protocol.',
    parameters: z.object({
      serviceUrl: z.string().describe('The URL of the gated service.'),
      providerAddress: z.string().describe('The Ethereum address of the provider.')
    }),
    // @ts-ignore
    execute: async ({ serviceUrl, providerAddress }: { serviceUrl: string, providerAddress: string }) => {
      const riskService = new RiskService(zkOracle as any, breaker as any, wdk);
      const profile = await riskService.getRiskProfile();

      const policyViolation = policyGuard.validateSwapTransaction({
        fromToken: env.WDK_USDT_ADDRESS,
        toToken: providerAddress,
        amount: ethers.parseUnits("0.1", 6).toString(),
        currentRiskLevel: profile.level as any,
        portfolioValue: (await vault.totalAssets()).toString(),
        estimatedSlippageBps: 0,
      });

      if (policyViolation.violated) {
        console.warn(`[X402] Policy violation: ${policyViolation.reason}`);
        return { status: "failed", error: `Policy violation: ${policyViolation.reason}` };
      }

      try {
        const paymentAmount = ethers.parseUnits("0.1", 6).toString();
        const portfolioValue = await vault.totalAssets();

        const paymentSim = await profitSimulator.simulateSwap({
          inputAmount: paymentAmount,
          inputToken: env.WDK_USDT_ADDRESS,
          outputToken: env.WDK_USDT_ADDRESS,
          expectedOutput: paymentAmount,
          slippage: 0,
        });

        console.log(`[X402] Payment simulation: ${JSON.stringify(paymentSim)}`);

        const insightData = await x402.payAndFetch(serviceUrl, providerAddress, "0.1");
        
        policyGuard.recordTransaction(paymentAmount);

        return { 
          status: "success", 
          insight: insightData.signal || 'Neutral',
          paymentSimulation: paymentSim
        };
      } catch (e: any) {
        return { status: "failed", error: e.message };
      }
    },
  }),

  yield_sweep: tool({
    description: 'Sweep accrued yield interest from the vault to the spending wallet.',
    parameters: z.object({
      context: z.string().describe('Reason/context for this action.')
    }),
    // @ts-ignore
    execute: async ({ context }: { context: string }) => {
      const bnbAccount = await wdk.getAccount('bnb');
      const spendingAccount = await wdk.getAccount('bnb', 1);
      const spendingAddress = await spendingAccount.getAddress();

      try {
        const myAddress = await bnbAccount.getAddress();
        const principal = await (vault as any).userPrincipal(myAddress);
        const maxWithdrawable = await vault.maxWithdraw(myAddress);
        
        if (maxWithdrawable > principal && (maxWithdrawable - principal) > ethers.parseUnits("1", 6)) {
          const yieldAmount = maxWithdrawable - principal;
          const portfolioValue = await vault.totalAssets();
          
          const yieldSim = await profitSimulator.simulateSwap({
            inputAmount: yieldAmount.toString(),
            inputToken: env.WDK_USDT_ADDRESS,
            outputToken: env.WDK_USDT_ADDRESS,
            expectedOutput: yieldAmount.toString(),
            slippage: 0,
          });

          console.log(`[YieldSweep] Yield simulation: ${JSON.stringify(yieldSim)}`);

          const tx = await bnbAccount.sendTransaction({
            to: await vault.getAddress(),
            data: vault.interface.encodeFunctionData("withdrawYield", [spendingAddress])
          } as any);

          policyGuard.recordTransaction(yieldAmount.toString());

          const res = { 
            actionTaken: 'YIELD_SWEPT', 
            txHash: tx.hash, 
            recipient: spendingAddress,
            yieldAmount: ethers.formatUnits(yieldAmount, 6),
            profitSimulation: yieldSim
          };
          await reportToDashboard('yieldSweep', res);
          return res;
        }
        return { actionTaken: 'SKIPPED', message: "No yield to sweep." };
      } catch (e: any) {
        return { error: "Yield sweep failed", message: e.message };
      }
    },
  })
};

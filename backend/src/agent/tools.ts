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
import { WdkExecutor } from './middleware/WdkExecutor';
import { createProfitSimulator } from './services/ProfitSimulator';
import { tool } from "ai";
import { z } from "zod";
import { env } from '@/config/env';
import { getContracts } from '@/contracts/clients/ethers';
import axios from 'axios';
import { logger } from '@/utils/logger';

import { AaveV3LendingAdapter, AAVE_V3_POOL_BNB } from '@/protocols/aave-v3-lending-adapter';
import { LayerZeroBridgeClient, LZ_ENDPOINT_BNB } from '@/protocols/layerzero-bridge-client';
import { LendingRiskCalculator } from '@/protocols/lending-risk-calculator';

function validateWDKSecretSeed(): void {
  const seed = env.WDK_SECRET_SEED;
  
  if (!seed) {
    throw new Error(
      '[Security] WDK_SECRET_SEED is not configured. ' +
      'Cannot initialize wallet without a valid seed phrase or private key.'
    );
  }
  
  const lowerSeed = seed.toLowerCase();
  if (
    lowerSeed.includes('replace_me') ||
    lowerSeed.includes('your_') ||
    lowerSeed === 'xxx' ||
    lowerSeed === '0x0'
  ) {
    throw new Error(
      '[Security] WDK_SECRET_SEED contains a placeholder value and is not safe for use. ' +
      'Please set a valid BIP-39 mnemonic (12-24 words) or hex private key starting with 0x.'
    );
  }
}

validateWDKSecretSeed();

// Initialize WDK
export const wdk = new WDK(env.WDK_SECRET_SEED);
wdk.registerWallet('bnb', WalletEVM, { provider: env.BNB_RPC_URL } as any);
wdk.registerWallet('solana', WalletSolana, { rpcUrl: env.SOLANA_RPC_URL } as any);
wdk.registerWallet('ton', WalletTON, { rpcUrl: env.TON_RPC_URL } as any);

const { engine, vault, usdt, zkOracle, breaker, auction } = getContracts();
const bridgeService = new BridgeService(wdk);
const x402 = new X402Client(wdk, env.WDK_USDT_ADDRESS);
const profitSimulator = createProfitSimulator(env.BNB_RPC_URL);
const policyGuard = getPolicyGuard();
const wdkExecutor = new WdkExecutor(wdk);


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
  } catch (e) {
    logger.warn(e, `[Tools] Failed to report ${node} to dashboard`);
  }
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
          // Buffer status returns (uint256 current, uint256 target, uint256 utilizationBps)
          const currentRaw = buffer.current ?? buffer[0] ?? 0n;
          const targetRaw = buffer.target ?? buffer[1] ?? 0n;
          const utilizationRaw = buffer.utilizationBps ?? buffer[2] ?? 0n;

          bufferTarget = Number(ethers.formatUnits(targetRaw, tokenDecimals));
          bufferCurrent = Number(ethers.formatUnits(currentRaw, tokenDecimals));
          bufferUtilizationBps = Number(utilizationRaw);
        } catch (e) {
          logger.warn(e, '[Tools] Could not fetch buffer status');
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

  get_all_chain_balances: tool({
    description: 'Fetch the native token (e.g., BNB, SOL, TON) and USDT balances across all registered multi-chain wallets.',
    parameters: z.object({
      context: z.string().describe('Reason/context for this action.')
    }),
    // @ts-ignore
    execute: async ({ context }: { context: string }) => {
      const results: Record<string, any> = {};
      const networks = ['bnb', 'solana', 'ton'];
      
      for (const network of networks) {
        try {
          const account = await wdk.getAccount(network);
          const address = await account.getAddress();
          
          let nativeBalance = "0";
          try {
            const nativeBigInt = await account.getBalance();
            const decimals = network === 'bnb' ? 18 : network === 'solana' ? 9 : 9;
            nativeBalance = ethers.formatUnits(nativeBigInt, decimals);
          } catch (e) {
            logger.warn(e, `[MultiVM] Failed to get native balance for ${network}`);
          }

          let usdtBalance = "0";
          try {
            let tokenAddress = env.WDK_USDT_ADDRESS;
            if ((account as any).getTokenBalance) {
               const usdtBigInt = await (account as any).getTokenBalance(tokenAddress);
               usdtBalance = ethers.formatUnits(usdtBigInt, 6);
            }
          } catch (e) {
            logger.warn(e, `[MultiVM] Failed to get USDT balance for ${network}`);
          }

          results[network] = {
            address,
            nativeBalance,
            usdtBalance,
            status: "Connected"
          };
        } catch (error: any) {
          results[network] = { error: `Wallet not registered or failed: ${error.message}` };
        }
      }
      
      await reportToDashboard('getAllChainBalances', { networks: results });
      return results;
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
        logger.warn({ reason: policyViolation.reason }, '[Rebalance] Policy violation');
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
              await wdkExecutor.sendTransaction('bnb', {
                to: env.WDK_USDT_ADDRESS,
                data: usdt.interface.encodeFunctionData("approve", [await auction.getAddress(), ethers.MaxUint256])
              }, { riskLevel: profile.level as any, portfolioValue: (await vault.totalAssets()).toString(), estimatedAmount: "0" });
            }

            const bidTx = await wdkExecutor.sendTransaction('bnb', {
              to: await auction.getAddress(),
              data: auction.interface.encodeFunctionData("bid", [myBid])
            }, { riskLevel: profile.level as any, portfolioValue: (await vault.totalAssets()).toString(), estimatedAmount: "0" });
            return { actionTaken: 'AUCTION_BID_PLACED', txHash: bidTx.hash };
          } 
          
          if (phase === 2 && status.winner.toLowerCase() === fromAddress.toLowerCase()) {
            const execTx = await wdkExecutor.sendTransaction('bnb', {
              to: await auction.getAddress(),
              data: auction.interface.encodeFunctionData("winnerExecute", [])
            }, { riskLevel: profile.level as any, portfolioValue: (await vault.totalAssets()).toString(), estimatedAmount: "0" });
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

      logger.debug({ profitSim }, '[Rebalance] Profit simulation');

      try {
        const tx = await wdkExecutor.sendTransaction('bnb', {
          to: txRequest.to,
          data: txRequest.data,
          value: txRequest.value
        }, { riskLevel: profile.level as any, portfolioValue: (await vault.totalAssets()).toString(), estimatedAmount: '100000000' });

        const res = { actionTaken: 'REBALANCED', txHash: tx.hash, profitSimulation: profitSim };
        await reportToDashboard('executeRebalance', res);
        return res;
      } catch (error: any) {
        logger.warn(error, '[Rebalance] Execution failed');
        return {
          actionTaken: 'BLOCKED_BY_POLICY_DURING_EXECUTION',
          reason: error.message
        };
      }
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
        logger.warn({ reason: policyViolation.reason }, '[Bridge] Policy violation');
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
          logger.info({ margin: profitSim.profitMargin }, '[Bridge] Not viable');
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
        logger.warn({ reason: policyViolation.reason }, '[X402] Policy violation');
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

        logger.debug({ paymentSim }, '[X402] Payment simulation');

        const insightData = await x402.payAndFetch(serviceUrl, providerAddress, paymentAmount, profile.level as any, portfolioValue.toString());
        
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

          logger.debug({ yieldSim }, '[YieldSweep] Yield simulation');

          try {
            const riskService = new RiskService(zkOracle as any, breaker as any, wdk);
            const profile = await riskService.getRiskProfile();
            const tx = await wdkExecutor.sendTransaction('bnb', {
              to: await vault.getAddress(),
              data: vault.interface.encodeFunctionData("withdrawYield", [spendingAddress])
            }, { riskLevel: profile.level as any, portfolioValue: (await vault.totalAssets()).toString(), estimatedAmount: yieldAmount.toString() });

            const res = { 
              actionTaken: 'YIELD_SWEPT', 
              txHash: tx.hash, 
              recipient: spendingAddress,
              yieldAmount: ethers.formatUnits(yieldAmount, 6),
              profitSimulation: yieldSim
            };
            await reportToDashboard('yieldSweep', res);
            return res;
          } catch (error: any) {
             logger.warn(error, '[YieldSweep] Blocked by policy guard');
             return { actionTaken: 'BLOCKED_BY_POLICY', message: error.message };
          }
        }
        return { actionTaken: 'SKIPPED', message: "No yield to sweep." };
      } catch (e: any) {
        return { error: "Yield sweep failed", message: e.message };
      }
    },
  }),

  supply_to_aave: tool({
    description: 'Supply USDT to Aave V3 on BNB Chain to earn yield.',
    parameters: z.object({
      amount: z.string().describe('Amount of USDT to supply (in decimal USDT, e.g., "100.5")')
    }),
    // @ts-ignore
    execute: async ({ amount }: { amount: string }) => {
      if (!env.WDK_AAVE_ADAPTER_ADDRESS) return { status: "failed", error: "Aave adapter address not configured" };
      const riskService = new RiskService(zkOracle as any, breaker as any, wdk);
      const profile = await riskService.getRiskProfile();
      const usdtAmount = ethers.parseUnits(amount, 6);
      
      try {
        const tx = await wdkExecutor.sendTransaction('bnb', {
          to: env.WDK_AAVE_ADAPTER_ADDRESS,
          data: new Interface(["function onVaultDeposit(uint256 amount) external"]).encodeFunctionData("onVaultDeposit", [usdtAmount])
        }, { 
          riskLevel: profile.level as any, 
          portfolioValue: (await vault.totalAssets()).toString(), 
          estimatedAmount: usdtAmount.toString() 
        });
        return { status: "success", action: "AAVE_SUPPLY", txHash: tx.hash };
      } catch (e: any) {
        return { status: "failed", error: e.message };
      }
    }
  }),

  withdraw_from_aave: tool({
    description: 'Withdraw USDT from Aave V3 on BNB Chain back to the vault.',
    parameters: z.object({
      amount: z.string().describe('Amount of USDT to withdraw (in decimal USDT, e.g., "100.5")')
    }),
    // @ts-ignore
    execute: async ({ amount }: { amount: string }) => {
      if (!env.WDK_AAVE_ADAPTER_ADDRESS) return { status: "failed", error: "Aave adapter address not configured" };
      const riskService = new RiskService(zkOracle as any, breaker as any, wdk);
      const profile = await riskService.getRiskProfile();
      const usdtAmount = ethers.parseUnits(amount, 6);
      
      try {
        const tx = await wdkExecutor.sendTransaction('bnb', {
          to: env.WDK_AAVE_ADAPTER_ADDRESS,
          data: new Interface(["function withdrawToVault(uint256 amount) external returns (uint256)"]).encodeFunctionData("withdrawToVault", [usdtAmount])
        }, { 
          riskLevel: profile.level as any, 
          portfolioValue: (await vault.totalAssets()).toString(), 
          estimatedAmount: usdtAmount.toString() 
        });
        return { status: "success", action: "AAVE_WITHDRAW", txHash: tx.hash };
      } catch (e: any) {
        return { status: "failed", error: e.message };
      }
    }
  }),

  bridge_via_layerzero: tool({
    description: 'Bridge USDT to another chain via LayerZero.',
    parameters: z.object({
      amount: z.string().describe('Amount of USDT to bridge'),
      dstEid: z.number().describe('Destination LayerZero Endpoint ID')
    }),
    // @ts-ignore
    execute: async ({ amount, dstEid }: { amount: string, dstEid: number }) => {
      if (!env.WDK_LZ_ADAPTER_ADDRESS) return { status: "failed", error: "LayerZero adapter address not configured" };
      const riskService = new RiskService(zkOracle as any, breaker as any, wdk);
      const profile = await riskService.getRiskProfile();
      const usdtAmount = ethers.parseUnits(amount, 6);
      const options = '0x00030100110100000000000000000000000000030d40'; // Example gas options

      try {
        const adapter = new LayerZeroBridgeClient(env.WDK_LZ_ADAPTER_ADDRESS, (await wdk.getAccount('bnb') as any).signer);
        const fee = await adapter.getQuote(dstEid, usdtAmount, options);

        const tx = await wdkExecutor.sendTransaction('bnb', {
          to: env.WDK_LZ_ADAPTER_ADDRESS,
          data: new Interface(["function bridge(uint32 dstEid, uint256 amount, bytes calldata options) external payable"]).encodeFunctionData("bridge", [dstEid, usdtAmount, options]),
          value: fee
        }, { 
          riskLevel: profile.level as any, 
          portfolioValue: (await vault.totalAssets()).toString(), 
          estimatedAmount: usdtAmount.toString() 
        });
        return { status: "success", action: "LZ_BRIDGE", txHash: tx.hash };
      } catch (e: any) {
        return { status: "failed", error: e.message };
      }
    }
  })
};

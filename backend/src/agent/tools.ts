import { ethers, Interface, Contract } from "ethers";
import { RiskService } from './services/RiskService';
import { BridgeService } from './services/BridgeService';
import { SimulationService } from './services/SimulationService';
import { X402Client } from './x402-client';
import { getPolicyGuard } from './middleware/PolicyGuard';
import { getWDK, getWalletEVM, getWalletSolana, getWalletTON } from '@/lib/wdk-loader';
import { WdkExecutor } from './middleware/WdkExecutor';
import { createProfitSimulator } from './services/ProfitSimulator';
import { tool } from "ai";
import { z } from "zod";
import { env } from '@/config/env';
import { getContracts } from '@/contracts/clients/ethers';
import axios from 'axios';
import { logger } from '@/utils/logger';
import { robotFleetService } from '@/services/RobotFleetService';

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

let wdkPromise: Promise<any> | null = null;

export async function getWdk() {
  if (!wdkPromise) {
    wdkPromise = (async () => {
      const [WDK, WalletEVM, WalletSolana, WalletTON] = await Promise.all([
        getWDK(),
        getWalletEVM(),
        getWalletSolana(),
        getWalletTON()
      ]);
      await Promise.all([
        WDK.registerWallet('bnb', WalletEVM, { provider: env.BNB_RPC_URL } as any),
        WDK.registerWallet('solana', WalletSolana, { rpcUrl: env.SOLANA_RPC_URL } as any),
        WDK.registerWallet('ton', WalletTON, { tonClient: { url: env.TON_RPC_URL, secretKey: env.TON_API_KEY } } as any)
      ]);
      return WDK;
    })();
  }
  return wdkPromise;
}

const { engine, vault, usdt, zkOracle, breaker, auction } = getContracts();

let bridgeServicePromise: Promise<BridgeService> | null = null;
let x402Promise: Promise<X402Client> | null = null;
let wdkExecutorPromise: Promise<WdkExecutor> | null = null;

async function getBridgeService() {
  if (!bridgeServicePromise) {
    bridgeServicePromise = (async () => {
      const wdk = await getWdk();
      return new BridgeService(wdk);
    })();
  }
  return bridgeServicePromise;
}

async function getX402Client() {
  if (!x402Promise) {
    x402Promise = (async () => {
      const wdk = await getWdk();
      return new X402Client(wdk, env.WDK_USDT_ADDRESS);
    })();
  }
  return x402Promise;
}

async function getWdkExecutor() {
  if (!wdkExecutorPromise) {
    wdkExecutorPromise = (async () => {
      const wdk = await getWdk();
      return new WdkExecutor(wdk);
    })();
  }
  return wdkExecutorPromise;
}

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
  } catch (e) {
    logger.warn(e, `[Tools] Failed to report ${node} to dashboard`);
  }
}

/**
 * Agent Tools Definition
 */
export const agentTools = {
  get_vault_status: tool({
    description: 'Get current status, total assets, health, and buffer utilization of the OmniAgentVault.',
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
          const account = await (await getWdk()).getAccount(network);
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
      const riskService = new RiskService(zkOracle as any, breaker as any, await getWdk());
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
      const riskService = new RiskService(null as any, breaker as any, await getWdk());
      
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
      const bnbAccount = await (await getWdk()).getAccount('bnb');
      const fromAddress = await bnbAccount.getAddress();

      const riskService = new RiskService(zkOracle as any, breaker as any, await getWdk());
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
              await (await getWdkExecutor()).sendTransaction('bnb', {
                to: env.WDK_USDT_ADDRESS,
                data: usdt.interface.encodeFunctionData("approve", [await auction.getAddress(), ethers.MaxUint256])
              }, { riskLevel: profile.level as any, portfolioValue: (await vault.totalAssets()).toString(), estimatedAmount: "0" });
            }

            const bidTx = await (await getWdkExecutor()).sendTransaction('bnb', {
              to: await auction.getAddress(),
              data: auction.interface.encodeFunctionData("bid", [myBid])
            }, { riskLevel: profile.level as any, portfolioValue: (await vault.totalAssets()).toString(), estimatedAmount: "0" });
            return { actionTaken: 'AUCTION_BID_PLACED', txHash: bidTx.hash };
          } 
          
          if (phase === 2 && status.winner.toLowerCase() === fromAddress.toLowerCase()) {
            const execTx = await (await getWdkExecutor()).sendTransaction('bnb', {
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
        const tx = await (await getWdkExecutor()).sendTransaction('bnb', {
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
      const riskService = new RiskService(zkOracle as any, breaker as any, await getWdk());
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

      const opportunity = await (await getBridgeService()).analyzeBridgeOpportunity('bnb', threshold);

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

        const bridgeResult = await (await getBridgeService()).executeBridge('bnb', opportunity.targetChain || '', 100);
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
      const riskService = new RiskService(zkOracle as any, breaker as any, await getWdk());
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

        const insightData = await (await getX402Client()).payAndFetch(serviceUrl, providerAddress, paymentAmount, profile.level as any, portfolioValue.toString());
        
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
      const bnbAccount = await (await getWdk()).getAccount('bnb');
      const spendingAccount = await (await getWdk()).getAccount('bnb', 1);
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
            const riskService = new RiskService(zkOracle as any, breaker as any, await getWdk());
            const profile = await riskService.getRiskProfile();
            const tx = await (await getWdkExecutor()).sendTransaction('bnb', {
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
      const riskService = new RiskService(zkOracle as any, breaker as any, await getWdk());
      const profile = await riskService.getRiskProfile();
      const usdtAmount = ethers.parseUnits(amount, 6);
      
      try {
        const tx = await (await getWdkExecutor()).sendTransaction('bnb', {
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
      const riskService = new RiskService(zkOracle as any, breaker as any, await getWdk());
      const profile = await riskService.getRiskProfile();
      const usdtAmount = ethers.parseUnits(amount, 6);
      
      try {
        const tx = await (await getWdkExecutor()).sendTransaction('bnb', {
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
    description: 'Bridge USDT to another chain via LayerZero adapter',
    parameters: z.object({
      amount: z.string().describe('Amount to bridge in USDT'),
      dstEid: z.number().describe('Destination endpoint ID (40231 for Solana testnet)'),
      context: z.string().describe('Reason for bridging to the destination chain.')
    }),
    // @ts-ignore
     execute: async ({ amount, dstEid, context }: { amount: string; dstEid: number; context: string }) => {
       try {
         const LZ_ADAPTER_ABI = [
           'function onVaultDeposit(uint256 amount) external',
           'function withdrawToVault(uint256 amount) external returns (uint256)',
           'function managedAssets() view returns (uint256)',
           'function quote(uint32 dstEid, uint256 amount, bytes options) view returns (uint256 nativeFee)',
           'function vault() view returns (address)',
           'function asset() view returns (address)'
         ];
         const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
         const lzAdapter = new ethers.Contract(env.WDK_LZ_ADAPTER_ADDRESS!, LZ_ADAPTER_ABI, signer);
        const refundAddress = await signer.getAddress();
        const usdtAmount = ethers.parseUnits(amount, 6);

        const tx = await lzAdapter.send(dstEid, '0x', '0x', refundAddress, { value: usdtAmount });
        await tx.wait();

        await reportToDashboard('bridge_via_layerzero', { txHash: tx.hash, dstEid, amount });
        return { success: true, txHash: tx.hash, dstEid, amount };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in bridge_via_layerzero');
        throw e;
      }
    }
  }),

  // ==================== BNB TOOLS (7) ====================
  bnb_create_wallet: tool({
    description: 'Create or retrieve a BNB blockchain wallet address',
    parameters: z.object({
      context: z.string().describe('Reason for accessing the wallet.')
    }),
    // @ts-ignore
    execute: async ({ context }: { context: string }) => {
      try {
        const account = await (await getWdk()).getAccount('bnb');
        const address = await account.getAddress();
        await reportToDashboard('bnb_create_wallet', { address, network: 'bnb' });
        return { success: true, address, network: 'bnb' };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in bnb_create_wallet');
        throw e;
      }
    }
  }),

  bnb_get_balance: tool({
    description: 'Get native BNB and token balance for a BNB address',
    parameters: z.object({
      address: z.string().optional().describe('BNB address (optional, defaults to main wallet)'),
      context: z.string().describe('Reason for checking balance.')
    }),
    // @ts-ignore
    execute: async ({ address, context }: { address?: string; context: string }) => {
       try {
         const targetAddress = address || (await (await getWdk()).getAccount('bnb').then((a: any) => a.getAddress()));
         const provider = new ethers.JsonRpcProvider(env.BNB_RPC_URL);
         const balanceWei = await provider.getBalance(targetAddress as string);
        const balanceBnb = ethers.formatEther(balanceWei);
        
        await reportToDashboard('bnb_get_balance', { balance: balanceBnb, address: targetAddress });
        return { success: true, nativeBalance: balanceBnb, nativeBalanceWei: balanceWei.toString() };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in bnb_get_balance');
        throw e;
      }
    }
  }),

  bnb_transfer: tool({
    description: 'Transfer native BNB or tokens on BNB blockchain',
    parameters: z.object({
      to: z.string().describe('Recipient BNB address'),
      amount: z.string().describe('Amount to transfer'),
      context: z.string().describe('Reason and authorization for this transfer.')
    }),
    // @ts-ignore
    execute: async ({ to, amount, context }: { to: string; amount: string; context: string }) => {
      try {
        const check = policyGuard.validateTransaction({
          toAddress: to,
          amount,
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000'
        });
        if (check.violated) {
          await reportToDashboard('bnb_transfer', { error: check.reason });
          return { error: check.reason };
        }

        const account = await (await getWdk()).getAccount('bnb');
        const result = await (account as any).transfer({ to, amount });
        
        await reportToDashboard('bnb_transfer', { txHash: result?.txHash || result?.hash, to, amount });
        return { success: true, txHash: result?.txHash || result?.hash, to, amount };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in bnb_transfer');
        throw e;
      }
    }
  }),

  bnb_swap: tool({
    description: 'Swap tokens on BNB blockchain via PancakeSwap',
    parameters: z.object({
      tokenIn: z.string().describe('Input token address'),
      tokenOut: z.string().describe('Output token address'),
      amountIn: z.string().describe('Amount of input token'),
      context: z.string().describe('Reason for performing this swap.')
    }),
    // @ts-ignore
    execute: async ({ tokenIn, tokenOut, amountIn, context }: { tokenIn: string; tokenOut: string; amountIn: string; context: string }) => {
      try {
        const check = policyGuard.validateSwapTransaction({
          fromToken: tokenIn,
          toToken: tokenOut,
          amount: amountIn,
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000',
          estimatedSlippageBps: 50
        });
        if (check.violated) {
          await reportToDashboard('bnb_swap', { error: check.reason });
          return { error: check.reason };
        }

        const account = await (await getWdk()).getAccount('bnb');
        const result = await (account as any).swap({ tokenIn, tokenOut, amountIn });
        
        await reportToDashboard('bnb_swap', { txHash: result?.txHash || result?.hash, tokenIn, tokenOut, amountIn });
        return { success: true, txHash: result?.txHash || result?.hash, tokenIn, tokenOut, amountIn };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in bnb_swap');
        throw e;
      }
    }
  }),

  bnb_supply_aave: tool({
    description: 'Supply tokens to Aave on BNB blockchain',
    parameters: z.object({
      asset: z.string().describe('Token address to supply'),
      amount: z.string().describe('Amount to supply'),
      context: z.string().describe('Reason for lending to Aave.')
    }),
    // @ts-ignore
    execute: async ({ asset, amount, context }: { asset: string; amount: string; context: string }) => {
      try {
        const check = policyGuard.validateTransaction({
          toAddress: asset,
          amount,
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000'
        });
        if (check.violated) {
          await reportToDashboard('bnb_supply_aave', { error: check.reason });
          return { error: check.reason };
        }

        const account = await (await getWdk()).getAccount('bnb');
        const result = await (account as any).supplyAave({ asset, amount });
        
        await reportToDashboard('bnb_supply_aave', { txHash: result?.txHash || result?.hash, asset, amount });
        return { success: true, txHash: result?.txHash || result?.hash, asset, amount };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in bnb_supply_aave');
        throw e;
      }
    }
  }),

  bnb_withdraw_aave: tool({
    description: 'Withdraw tokens from Aave on BNB blockchain',
    parameters: z.object({
      asset: z.string().describe('Token address to withdraw'),
      amount: z.string().describe('Amount to withdraw'),
      context: z.string().describe('Reason for withdrawing from Aave.')
    }),
    // @ts-ignore
    execute: async ({ asset, amount, context }: { asset: string; amount: string; context: string }) => {
      try {
        const check = policyGuard.validateTransaction({
          toAddress: asset,
          amount,
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000'
        });
        if (check.violated) {
          await reportToDashboard('bnb_withdraw_aave', { error: check.reason });
          return { error: check.reason };
        }

        const account = await (await getWdk()).getAccount('bnb');
        const result = await (account as any).withdrawAave({ asset, amount });
        
        await reportToDashboard('bnb_withdraw_aave', { txHash: result?.txHash || result?.hash, asset, amount });
        return { success: true, txHash: result?.txHash || result?.hash, asset, amount };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in bnb_withdraw_aave');
        throw e;
      }
    }
  }),

  bnb_bridge_layerzero: tool({
    description: 'Bridge BNB or tokens to another chain via LayerZero',
    parameters: z.object({
      amount: z.string().describe('Amount to bridge'),
      dstChain: z.string().describe('Destination chain name'),
      context: z.string().describe('Reason for bridging.')
    }),
    // @ts-ignore
    execute: async ({ amount, dstChain, context }: { amount: string; dstChain: string; context: string }) => {
      try {
         const check = policyGuard.validateTransaction({
           toAddress: dstChain,
           amount,
           currentRiskLevel: 'LOW',
           portfolioValue: '1000000'
         });
         if (check.violated) {
           await reportToDashboard('bnb_bridge_layerzero', { error: check.reason });
           return { error: check.reason };
         }

        const account = await (await getWdk()).getAccount('bnb');
        const result = await (account as any).bridgeLayerZero({ amount, dstChain });
        
        await reportToDashboard('bnb_bridge_layerzero', { txHash: result?.txHash || result?.hash, amount, dstChain });
        return { success: true, txHash: result?.txHash || result?.hash, amount, dstChain };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in bnb_bridge_layerzero');
        throw e;
      }
    }
  }),

  // ==================== SOLANA TOOLS (4) ====================
  sol_create_wallet: tool({
    description: 'Create or retrieve a Solana blockchain wallet address',
    parameters: z.object({
      context: z.string().describe('Reason for accessing the wallet.')
    }),
    // @ts-ignore
    execute: async ({ context }: { context: string }) => {
      try {
        const account = await (await getWdk()).getAccount('solana');
        const address = await account.getAddress();
        await reportToDashboard('sol_create_wallet', { address, network: 'solana' });
        return { success: true, address, network: 'solana' };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in sol_create_wallet');
        throw e;
      }
    }
  }),

  sol_get_balance: tool({
    description: 'Get native SOL and token balance for a Solana address',
    parameters: z.object({
      address: z.string().optional().describe('Solana address (optional, defaults to main wallet)'),
      context: z.string().describe('Reason for checking balance.')
    }),
    // @ts-ignore
    execute: async ({ address, context }: { address?: string; context: string }) => {
      try {
        const targetAddress = address || (await (await getWdk()).getAccount('solana').then((a: any) => a.getAddress()));
        const account = await (await getWdk()).getAccount('solana');
        const balance = await (account as any).getBalance(targetAddress);
        
        await reportToDashboard('sol_get_balance', { balance, address: targetAddress });
        return { success: true, nativeBalance: balance };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in sol_get_balance');
        throw e;
      }
    }
  }),

  sol_transfer: tool({
    description: 'Transfer native SOL or tokens on Solana blockchain',
    parameters: z.object({
      to: z.string().describe('Recipient Solana address'),
      amount: z.string().describe('Amount to transfer'),
      context: z.string().describe('Reason and authorization for this transfer.')
    }),
    // @ts-ignore
     execute: async ({ to, amount, context }: { to: string; amount: string; context: string }) => {
      try {
        const check = policyGuard.validateTransaction({
          toAddress: to,
          amount,
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000'
        });
        if (check.violated) {
          await reportToDashboard('sol_transfer', { error: check.reason });
          return { error: check.reason };
        }

        const account = await (await getWdk()).getAccount('solana');
        const result = await (account as any).transfer({ to, amount });
        
        await reportToDashboard('sol_transfer', { txHash: result?.txHash || result?.hash, to, amount });
        return { success: true, txHash: result?.txHash || result?.hash, to, amount };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in sol_transfer');
        throw e;
      }
    }
  }),

  sol_swap: tool({
    description: 'Swap tokens on Solana blockchain via Jupiter',
    parameters: z.object({
      tokenIn: z.string().describe('Input token mint address'),
      tokenOut: z.string().describe('Output token mint address'),
      amountIn: z.string().describe('Amount of input token'),
      context: z.string().describe('Reason for performing this swap.')
    }),
    // @ts-ignore
     execute: async ({ tokenIn, tokenOut, amountIn, context }: { tokenIn: string; tokenOut: string; amountIn: string; context: string }) => {
      try {
        const check = policyGuard.validateSwapTransaction({
          fromToken: tokenIn,
          toToken: tokenOut,
          amount: amountIn,
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000',
          estimatedSlippageBps: 50
        });
        if (check.violated) {
          await reportToDashboard('sol_swap', { error: check.reason });
          return { error: check.reason };
        }

        const account = await (await getWdk()).getAccount('solana');
        const result = await (account as any).swap({ tokenIn, tokenOut, amountIn });
        
        await reportToDashboard('sol_swap', { txHash: result?.txHash || result?.hash, tokenIn, tokenOut, amountIn });
        return { success: true, txHash: result?.txHash || result?.hash, tokenIn, tokenOut, amountIn };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in sol_swap');
        throw e;
      }
    }
  }),

  // ==================== TON TOOLS (3) ====================
  ton_create_wallet: tool({
    description: 'Create or retrieve a TON blockchain wallet address',
    parameters: z.object({
      wallet_index: z.number().optional().describe('Wallet index (0 for main, 1+ for sub-wallets)'),
      context: z.string().describe('Reason for accessing the wallet.')
    }),
    // @ts-ignore
    execute: async ({ wallet_index, context }: { wallet_index?: number; context: string }) => {
      try {
        const walletIndex = wallet_index || 0;
        const account = await (await getWdk()).getAccount('ton', walletIndex);
        const address = await account.getAddress();
        await reportToDashboard('ton_create_wallet', { address, network: 'ton' });
        return { success: true, address, network: 'ton' };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in ton_create_wallet');
        throw e;
      }
    }
  }),

  ton_get_balance: tool({
    description: 'Get native TON balance for a TON address',
    parameters: z.object({
      address: z.string().optional().describe('TON address (optional, defaults to main wallet)'),
      context: z.string().describe('Reason for checking balance.')
    }),
    // @ts-ignore
    execute: async ({ address, context }: { address?: string; context: string }) => {
      try {
        const targetAddress = address || (await (await getWdk()).getAccount('ton').then((a: any) => a.getAddress()));
        const account = await (await getWdk()).getAccount('ton');
        const balance = await (account as any).getBalance(targetAddress);
        
        await reportToDashboard('ton_get_balance', { balance, address: targetAddress });
        return { success: true, nativeBalance: balance };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in ton_get_balance');
        throw e;
      }
    }
  }),

  ton_transfer: tool({
    description: 'Transfer native TON or Jetton tokens on TON blockchain',
    parameters: z.object({
      to: z.string().describe('Recipient TON address'),
      amount: z.string().describe('Amount to transfer in TON units'),
      context: z.string().describe('Reason and authorization for this transfer.')
    }),
    // @ts-ignore
    execute: async ({ to, amount, context }: { to: string; amount: string; context: string }) => {
      try {
        const check = policyGuard.validateTransaction({
          toAddress: to,
          amount: amount,
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000'
        });
        if (check.violated) {
          await reportToDashboard('ton_transfer', { error: check.reason });
          return { error: check.reason };
        }

        const account = await (await getWdk()).getAccount('ton');
        const result = await (account as any).transfer({ to, amount });
        
        await reportToDashboard('ton_transfer', { txHash: result?.txHash || result?.hash, to, amount });
        return { success: true, txHash: result?.txHash || result?.hash, to, amount };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in ton_transfer');
        throw e;
      }
    }
  }),

  // ==================== WDK TOOLS (10) ====================
  wdk_mint_test_token: tool({
    description: 'Mint test USDT tokens for testing (local hardhat only)',
    parameters: z.object({
      amount: z.string().optional().describe('Amount of USDT to mint'),
      recipient: z.string().optional().describe('Address to receive minted tokens'),
      context: z.string().describe('Reason for minting test tokens.')
    }),
    // @ts-ignore
    execute: async ({ amount, recipient, context }: { amount?: string; recipient?: string; context: string }) => {
      try {
        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const usdtContract = new ethers.Contract(env.WDK_USDT_ADDRESS!, ['function mint(address to, uint256 amount) external'], signer);
        
        const finalRecipient = recipient || await signer.getAddress();
        const mintAmount = ethers.parseUnits(amount || '1000', 6);
        const tx = await usdtContract.mint(finalRecipient, mintAmount);
        await tx.wait();
        
        await reportToDashboard('wdk_mint_test_token', { txHash: tx.hash, amount, recipient: finalRecipient });
        return { success: true, txHash: tx.hash, amount, recipient: finalRecipient };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in wdk_mint_test_token');
        throw e;
      }
    }
  }),

  wdk_vault_deposit: tool({
    description: 'Deposit USDT into the WDK Vault',
    parameters: z.object({
      amount: z.string().describe('Amount of USDT to deposit'),
      context: z.string().describe('Reason for depositing into vault.')
    }),
    // @ts-ignore
    execute: async ({ amount, context }: { amount: string; context: string }) => {
      try {
        const check = policyGuard.validateTransaction({
          toAddress: env.WDK_VAULT_ADDRESS!,
          amount: amount,
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000'
        });
        if (check.violated) {
          await reportToDashboard('wdk_vault_deposit', { error: check.reason });
          return { error: check.reason };
        }

        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const vaultContract = new ethers.Contract(env.WDK_VAULT_ADDRESS!, ['function deposit(uint256 assets, address receiver) external returns (uint256 shares)'], signer);
        const signerAddress = await signer.getAddress();
        const depositAmount = ethers.parseUnits(amount, 6);
        
        const tx = await vaultContract.deposit(depositAmount, signerAddress);
        await tx.wait();
        
        await reportToDashboard('wdk_vault_deposit', { txHash: tx.hash, amount });
        return { success: true, txHash: tx.hash, amount };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in wdk_vault_deposit');
        throw e;
      }
    }
  }),

  wdk_vault_withdraw: tool({
    description: 'Withdraw USDT from the WDK Vault',
    parameters: z.object({
      amount: z.string().describe('Amount of USDT to withdraw'),
      context: z.string().describe('Reason for withdrawing from vault.')
    }),
    // @ts-ignore
    execute: async ({ amount, context }: { amount: string; context: string }) => {
      try {
        const check = policyGuard.validateTransaction({
          toAddress: env.WDK_VAULT_ADDRESS!,
          amount: amount,
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000'
        });
        if (check.violated) {
          await reportToDashboard('wdk_vault_withdraw', { error: check.reason });
          return { error: check.reason };
        }

        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const vaultContract = new ethers.Contract(env.WDK_VAULT_ADDRESS!, ['function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares)'], signer);
        const signerAddress = await signer.getAddress();
        const withdrawAmount = ethers.parseUnits(amount, 6);
        
        const tx = await vaultContract.withdraw(withdrawAmount, signerAddress, signerAddress);
        await tx.wait();
        
        await reportToDashboard('wdk_vault_withdraw', { txHash: tx.hash, amount });
        return { success: true, txHash: tx.hash, amount };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in wdk_vault_withdraw');
        throw e;
      }
    }
  }),

  wdk_vault_get_balance: tool({
    description: 'Get the vault balance for an account',
    parameters: z.object({
      account: z.string().optional().describe('Account address to check balance for'),
      context: z.string().describe('Reason for checking vault balance.')
    }),
    // @ts-ignore
    execute: async ({ account, context }: { account?: string; context: string }) => {
      try {
        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const vaultContract = new ethers.Contract(env.WDK_VAULT_ADDRESS!, ['function balanceOf(address account) view returns (uint256)'], new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        
        const targetAccount = account || await signer.getAddress();
        const balance = await vaultContract.balanceOf(targetAccount);
        
        await reportToDashboard('wdk_vault_get_balance', { balance: balance.toString(), account: targetAccount });
        return { success: true, balance: balance.toString(), account: targetAccount };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in wdk_vault_get_balance');
        throw e;
      }
    }
  }),

  wdk_vault_get_state: tool({
    description: 'Get the current state of the WDK Vault (buffer status)',
    parameters: z.object({
      context: z.string().describe('Reason for checking vault state.')
    }),
    // @ts-ignore
    execute: async ({ context }: { context: string }) => {
      try {
        const vaultContract = new ethers.Contract(env.WDK_VAULT_ADDRESS!, ['function bufferStatus() view returns (uint256 current, uint256 target, uint256 utilizationBps)'], new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const state = await vaultContract.bufferStatus();
        
        await reportToDashboard('wdk_vault_get_state', { current: state[0].toString(), target: state[1].toString(), utilization: state[2].toString() });
        return { success: true, currentBuffer: state[0].toString(), targetBuffer: state[1].toString(), utilizationBps: state[2].toString() };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in wdk_vault_get_state');
        throw e;
      }
    }
  }),

  wdk_engine_execute_cycle: tool({
    description: 'Execute a cycle in the WDK Engine',
    parameters: z.object({
      context: z.string().describe('Reason for executing engine cycle.')
    }),
    // @ts-ignore
    execute: async ({ context }: { context: string }) => {
      try {
        const check = policyGuard.validateTransaction({
          toAddress: env.WDK_ENGINE_ADDRESS!,
          amount: '0',
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000'
        });
        if (check.violated) {
          await reportToDashboard('wdk_engine_execute_cycle', { error: check.reason });
          return { error: check.reason };
        }

        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const engineContract = new ethers.Contract(env.WDK_ENGINE_ADDRESS!, ['function executeCycle() external'], signer);
        const tx = await engineContract.executeCycle();
        await tx.wait();
        
        await reportToDashboard('wdk_engine_execute_cycle', { txHash: tx.hash });
        return { success: true, txHash: tx.hash, cycleNumber: 0 };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in wdk_engine_execute_cycle');
        throw e;
      }
    }
  }),

  wdk_engine_get_cycle_state: tool({
    description: 'Get the current cycle state and decision preview from WDK Engine',
    parameters: z.object({
      context: z.string().describe('Reason for checking cycle state.')
    }),
    // @ts-ignore
    execute: async ({ context }: { context: string }) => {
      try {
        const engineContract = new ethers.Contract(env.WDK_ENGINE_ADDRESS!, ['function previewDecision() view returns (tuple(bool executable, bytes32 reason, uint8 nextState, uint256 price, uint256 previousPrice, uint256 volatilityBps, uint256 targetWDKBps, uint256 targetLpBps, uint256 targetLendingBps, uint256 bountyBps, bool breakerPaused, int256 meanYieldBps, uint256 yieldVolatilityBps, int256 sharpeRatio, uint256 auctionElapsedSeconds, uint256 bufferUtilizationBps, uint256 healthFactor))'], new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const state = await engineContract.previewDecision();
        
        await reportToDashboard('wdk_engine_get_cycle_state', { nextState: state[2], price: state[3].toString() });
        return { success: true, nextState: String(state[2]), price: String(state[3]), timestamp: Date.now().toString(), cycleNumber: '0' };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in wdk_engine_get_cycle_state');
        throw e;
      }
    }
  }),

  wdk_engine_get_risk_metrics: tool({
    description: 'Get risk metrics (health factor) from the WDK Engine',
    parameters: z.object({
      context: z.string().describe('Reason for checking risk metrics.')
    }),
    // @ts-ignore
    execute: async ({ context }: { context: string }) => {
      try {
        const engineContract = new ethers.Contract(env.WDK_ENGINE_ADDRESS!, ['function getHealthFactor() view returns (uint256)'], new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const healthFactor = await engineContract.getHealthFactor();
        
        await reportToDashboard('wdk_engine_get_risk_metrics', { healthFactor: healthFactor.toString() });
        return { success: true, healthFactor: healthFactor.toString() };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in wdk_engine_get_risk_metrics');
        throw e;
      }
    }
  }),

  wdk_aave_supply: tool({
    description: 'Supply USDT to Aave via the adapter',
    parameters: z.object({
      amount: z.string().describe('Amount of USDT to supply'),
      context: z.string().describe('Reason for supplying to Aave.')
    }),
    // @ts-ignore
    execute: async ({ amount, context }: { amount: string; context: string }) => {
      try {
        const check = policyGuard.validateTransaction({
          toAddress: env.WDK_AAVE_ADAPTER_ADDRESS!,
          amount: amount,
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000'
        });
        if (check.violated) {
          await reportToDashboard('wdk_aave_supply', { error: check.reason });
          return { error: check.reason };
        }

        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const aaveAdapterContract = new ethers.Contract(env.WDK_AAVE_ADAPTER_ADDRESS!, ['function onVaultDeposit(uint256 amount) external'], signer);
        const supplyAmount = ethers.parseUnits(amount, 6);
        const tx = await aaveAdapterContract.onVaultDeposit(supplyAmount);
        await tx.wait();
        
        await reportToDashboard('wdk_aave_supply', { txHash: tx.hash, amount });
        return { success: true, txHash: tx.hash, action: 'AAVE_SUPPLY' };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in wdk_aave_supply');
        throw e;
      }
    }
  }),

  wdk_aave_withdraw: tool({
    description: 'Withdraw USDT from Aave via the adapter',
    parameters: z.object({
      amount: z.string().describe('Amount of USDT to withdraw'),
      context: z.string().describe('Reason for withdrawing from Aave.')
    }),
    // @ts-ignore
    execute: async ({ amount, context }: { amount: string; context: string }) => {
      try {
        const check = policyGuard.validateTransaction({
          toAddress: env.WDK_AAVE_ADAPTER_ADDRESS!,
          amount: amount,
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000'
        });
        if (check.violated) {
          await reportToDashboard('wdk_aave_withdraw', { error: check.reason });
          return { error: check.reason };
        }

        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const aaveAdapterContract = new ethers.Contract(env.WDK_AAVE_ADAPTER_ADDRESS!, ['function withdrawToVault(uint256 amount) external returns (uint256)'], signer);
        const withdrawAmount = ethers.parseUnits(amount, 6);
        const tx = await aaveAdapterContract.withdrawToVault(withdrawAmount);
        await tx.wait();
        
        await reportToDashboard('wdk_aave_withdraw', { txHash: tx.hash, amount });
        return { success: true, txHash: tx.hash, amountWithdrawn: amount };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in wdk_aave_withdraw');
        throw e;
      }
    }
  }),

  // ==================== X402 TOOLS (4) ====================
  x402_pay_subagent: tool({
    description: 'Pay a sub-agent (robot) for specialized task execution using x402 protocol',
    parameters: z.object({
      provider_address: z.string().describe('Sub-agent wallet address to pay'),
      amount: z.string().describe('Amount of USDT to pay'),
      service_type: z.string().describe('Type of service: risk_analysis, arbitrage_scan, yield_optimization, data_fetch'),
      context: z.string().describe('Reason for paying sub-agent.')
    }),
    // @ts-ignore
    execute: async ({ provider_address, amount, service_type, context }: { provider_address: string; amount: string; service_type: string; context: string }) => {
      try {
        const check = policyGuard.validateTransaction({
          toAddress: provider_address,
          amount: amount,
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000'
        });
        if (check.violated) {
          await reportToDashboard('x402_pay_subagent', { error: check.reason });
          return { error: check.reason };
        }

        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const usdtContract = new ethers.Contract(env.WDK_USDT_ADDRESS!, ['function transfer(address to, uint256 amount) external returns (bool)'], signer);
        const payAmount = ethers.parseUnits(amount, 6);
        
        const tx = await usdtContract.transfer(provider_address, payAmount);
        await tx.wait();
        
        await reportToDashboard('x402_pay_subagent', { txHash: tx.hash, amount, serviceType: service_type });
        return { success: true, txHash: tx.hash, amount, serviceType: service_type };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in x402_pay_subagent');
        throw e;
      }
    }
  }),

  x402_get_balance: tool({
    description: 'Get USDT balance for x402 payments',
    parameters: z.object({
      address: z.string().optional().describe('Wallet address to check'),
      context: z.string().describe('Reason for checking balance.')
    }),
    // @ts-ignore
    execute: async ({ address, context }: { address?: string; context: string }) => {
      try {
        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const targetAddress = address || await signer.getAddress();
        const usdtContract = new ethers.Contract(env.WDK_USDT_ADDRESS!, ['function balanceOf(address account) external view returns (uint256)', 'function decimals() external view returns (uint8)'], new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        
        const balance = await usdtContract.balanceOf(targetAddress);
        const decimals = await usdtContract.decimals();
        const balanceFormatted = ethers.formatUnits(balance, decimals);
        
        await reportToDashboard('x402_get_balance', { balance: balance.toString(), balanceFormatted });
        return { success: true, balance: balance.toString(), balanceFormatted };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in x402_get_balance');
        throw e;
      }
    }
  }),

  x402_list_services: tool({
    description: 'List available sub-agent services that can be hired via x402 payments',
    parameters: z.object({
      context: z.string().describe('Reason for listing services.')
    }),
    // @ts-ignore
    execute: async ({ context }: { context: string }) => {
      try {
        const services = [
          { id: 'risk_analysis', name: 'Risk Analysis Agent', description: 'Advanced risk assessment', priceUsdt: '0.1' },
          { id: 'arbitrage_scan', name: 'Arbitrage Scanner', description: 'Cross-exchange arbitrage detection', priceUsdt: '0.2' },
          { id: 'yield_optimization', name: 'Yield Optimizer', description: 'Find best yield farming opportunities', priceUsdt: '0.15' },
          { id: 'data_fetch', name: 'Data Fetcher', description: 'On-chain and off-chain data retrieval', priceUsdt: '0.05' }
        ];
        
        await reportToDashboard('x402_list_services', { serviceCount: services.length });
        return { success: true, services };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in x402_list_services');
        throw e;
      }
    }
  }),

  x402_fleet_status: tool({
    description: 'Get the robot fleet status and earnings',
    parameters: z.object({
      context: z.string().describe('Reason for checking fleet status.')
    }),
    // @ts-ignore
    execute: async ({ context }: { context: string }) => {
      try {
        const status = { enabled: true, robotCount: 3, totalEarned: '0.0000' };
        await reportToDashboard('x402_fleet_status', status);
        return { success: true, ...status };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in x402_fleet_status');
        throw e;
      }
    }
  }),

  // ==================== ERC4337 TOOLS (12) ====================
  erc4337_create_account: tool({
    description: 'Create a smart account using ERC-4337',
    parameters: z.object({
      salt: z.string().optional().describe('Salt for account creation'),
      context: z.string().describe('Reason for creating smart account.')
    }),
    // @ts-ignore
    execute: async ({ salt, context }: { salt?: string; context: string }) => {
      if (!env.ERC4337_FACTORY_ADDRESS) {
        return { error: 'ERC4337_FACTORY_ADDRESS not configured. Set it in .env file.' };
      }
      try {
        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        
        const signerAddress = await signer.getAddress();
        
        const factoryContract = new ethers.Contract(env.ERC4337_FACTORY_ADDRESS, ['function createAccount(address owner) external returns (address)'], signer);
        const tx = await factoryContract.createAccount(signerAddress);
        await tx.wait();
        
        await reportToDashboard('erc4337_create_account', { txHash: tx.hash });
        return { success: true, txHash: tx.hash };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in erc4337_create_account');
        throw e;
      }
    }
  }),

  erc4337_get_account_address: tool({
    description: 'Get smart account address for owner',
    parameters: z.object({
      owner: z.string().optional().describe('Owner address (defaults to agent wallet)')
    }),
    // @ts-ignore
    execute: async ({ owner }: { owner?: string }) => {
      if (!env.ERC4337_FACTORY_ADDRESS) {
        return { error: 'ERC4337_FACTORY_ADDRESS not configured. Set it in .env file.' };
      }
      try {
        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const ownerAddress = owner || await signer.getAddress();
        
        const FACTORY_ABI = ['function getAccountAddress(address owner) external view returns (address)'];
        const factoryContract = new ethers.Contract(env.ERC4337_FACTORY_ADDRESS, FACTORY_ABI, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const address = await factoryContract.getAccountAddress(ownerAddress);
       
        await reportToDashboard('erc4337_get_account_address', { address });
        return { success: true, address };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in erc4337_get_account_address');
        throw e;
      }
    }
  }),

  erc4337_is_valid_account: tool({
    description: 'Check if a smart account is deployed',
    parameters: z.object({
      account_address: z.string().describe('Smart account address to check'),
      context: z.string().describe('Reason for checking account validity.')
    }),
    // @ts-ignore
    execute: async ({ account_address, context }: { account_address: string; context: string }) => {
      try {
        const provider = new ethers.JsonRpcProvider(env.BNB_RPC_URL);
        const code = await provider.getCode(account_address);
        const isDeployed = code !== '0x';
        
        await reportToDashboard('erc4337_is_valid_account', { accountAddress: account_address, isDeployed });
        return { success: true, accountAddress: account_address, isDeployed };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in erc4337_is_valid_account');
        throw e;
      }
    }
  }),

  erc4337_execute: tool({
    description: 'Execute a single transaction via smart account',
    parameters: z.object({
      to: z.string().describe('Target address'),
      data: z.string().describe('Call data'),
      value: z.string().optional().describe('ETH value to send'),
      context: z.string().describe('Reason for executing transaction.')
    }),
    // @ts-ignore
    execute: async ({ to, data, value, context }: { to: string; data: string; value?: string; context: string }) => {
      try {
        const check = policyGuard.validateTransaction({
          toAddress: to,
          amount: value || '0',
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000'
        });
        if (check.violated) {
          await reportToDashboard('erc4337_execute', { error: check.reason });
          return { error: check.reason };
        }

        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const signerAddress = await signer.getAddress();
        const accountContract = new ethers.Contract(signerAddress, ['function execute(address dest, uint256 value, bytes calldata func) external'], signer);
        
        const txValue = value ? ethers.parseEther(value) : 0n;
        const tx = await accountContract.execute(to, txValue, data);
        await tx.wait();
        
        await reportToDashboard('erc4337_execute', { txHash: tx.hash, to, value });
        return { success: true, txHash: tx.hash, to, value };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in erc4337_execute');
        throw e;
      }
    }
  }),

  erc4337_execute_batch: tool({
    description: 'Execute multiple transactions via smart account',
    parameters: z.object({
      calls: z.array(z.object({
        to: z.string(),
        data: z.string(),
        value: z.string().optional()
      })).describe('Array of call objects'),
      context: z.string().describe('Reason for executing batch.')
    }),
    // @ts-ignore
    execute: async ({ calls, context }: { calls: any[]; context: string }) => {
      try {
        const totalValue = calls.reduce((sum, c) => sum + (c.value ? ethers.parseEther(c.value) : 0n), 0n);
        const check = policyGuard.validateTransaction({
          toAddress: calls[0]?.to || ethers.ZeroAddress,
          amount: totalValue.toString(),
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000'
        });
        if (check.violated) {
          await reportToDashboard('erc4337_execute_batch', { error: check.reason });
          return { error: check.reason };
        }

        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const signerAddress = await signer.getAddress();
        const accountContract = new ethers.Contract(signerAddress, ['function executeBatch(address[] dests, uint256[] values, bytes[] calldatas) external'], signer);
        
        const dests = calls.map(c => c.to);
        const values = calls.map(c => c.value ? ethers.parseEther(c.value) : 0n);
        const calldatas = calls.map(c => c.data);
        
        const tx = await accountContract.executeBatch(dests, values, calldatas);
        await tx.wait();
        
        await reportToDashboard('erc4337_execute_batch', { txHash: tx.hash, callCount: calls.length });
        return { success: true, txHash: tx.hash, callCount: calls.length };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in erc4337_execute_batch');
        throw e;
      }
    }
  }),

  erc4337_add_deposit: tool({
    description: 'Add deposit to EntryPoint for gas payments',
    parameters: z.object({
      amount: z.string().describe('Amount of ETH to deposit'),
      context: z.string().describe('Reason for adding deposit.')
    }),
    // @ts-ignore
    execute: async ({ amount, context }: { amount: string; context: string }) => {
      try {
        const check = policyGuard.validateTransaction({
          toAddress: env.ERC4337_ENTRYPOINT_ADDRESS!,
          amount: amount,
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000'
        });
        if (check.violated) {
          await reportToDashboard('erc4337_add_deposit', { error: check.reason });
          return { error: check.reason };
        }

        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const signerAddress = await signer.getAddress();
        const entryPointContract = new ethers.Contract(env.ERC4337_ENTRYPOINT_ADDRESS!, ['function depositTo(address account) external payable'], signer);
        
        const depositAmount = ethers.parseEther(amount);
        const tx = await entryPointContract.depositTo(signerAddress, { value: depositAmount });
        await tx.wait();
        
        await reportToDashboard('erc4337_add_deposit', { txHash: tx.hash, amount });
        return { success: true, txHash: tx.hash, amount };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in erc4337_add_deposit');
        throw e;
      }
    }
  }),

  erc4337_get_balance: tool({
    description: 'Get balance of smart account',
    parameters: z.object({
      account_address: z.string().optional().describe('Account address to check'),
      context: z.string().describe('Reason for checking balance.')
    }),
    // @ts-ignore
     execute: async ({ account_address, context }: { account_address?: string; context: string }) => {
       try {
         const provider = new ethers.JsonRpcProvider(env.BNB_RPC_URL);
         const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, provider);
         const signerAddress = await signer.getAddress();
         const targetAddress = account_address || signerAddress;
         const balance = await provider.getBalance(targetAddress);
        
        await reportToDashboard('erc4337_get_balance', { balance: balance.toString(), address: targetAddress });
        return { success: true, balance: balance.toString(), address: targetAddress };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in erc4337_get_balance');
        throw e;
      }
    }
  }),

  erc4337_get_deposit: tool({
    description: 'Get EntryPoint deposit for account',
    parameters: z.object({
      account_address: z.string().optional().describe('Account address'),
      context: z.string().describe('Reason for checking deposit.')
    }),
    // @ts-ignore
     execute: async ({ account_address, context }: { account_address?: string; context: string }) => {
       try {
         const provider = new ethers.JsonRpcProvider(env.BNB_RPC_URL);
         const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, provider);
         const signerAddress = await signer.getAddress();
         const targetAddress = account_address || signerAddress;
         const entryPointContract = new ethers.Contract(env.ERC4337_ENTRYPOINT_ADDRESS!, ['function balanceOf(address account) external view returns (uint256)'], provider);
        
        const deposit = await entryPointContract.balanceOf(targetAddress);
        
        await reportToDashboard('erc4337_get_deposit', { deposit: deposit.toString(), address: targetAddress });
        return { success: true, deposit: deposit.toString(), address: targetAddress };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in erc4337_get_deposit');
        throw e;
      }
    }
  }),

  erc4337_withdraw_token: tool({
    description: 'Withdraw ERC-20 token from smart account',
    parameters: z.object({
      token_address: z.string().describe('ERC-20 token contract address'),
      amount: z.string().describe('Amount to withdraw'),
      to: z.string().optional().describe('Recipient address'),
      context: z.string().describe('Reason for withdrawing tokens.')
    }),
    // @ts-ignore
    execute: async ({ token_address, amount, to, context }: { token_address: string; amount: string; to?: string; context: string }) => {
      try {
        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const recipient = to || await signer.getAddress();
        
        const check = policyGuard.validateTransaction({
          toAddress: recipient,
          amount: amount,
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000'
        });
        if (check.violated) {
          await reportToDashboard('erc4337_withdraw_token', { error: check.reason });
          return { error: check.reason };
        }

        // Call transfer through account
        const signerAddress = await signer.getAddress();
        const erc20Interface = new ethers.Interface(['function transfer(address to, uint256 amount) external returns (bool)']);
        const data = erc20Interface.encodeFunctionData('transfer', [recipient, ethers.parseUnits(amount, 6)]);
        
        const accountContract = new ethers.Contract(signerAddress, ['function execute(address dest, uint256 value, bytes calldata func) external'], signer);
        const tx = await accountContract.execute(token_address, 0, data);
        await tx.wait();
        
        await reportToDashboard('erc4337_withdraw_token', { txHash: tx.hash, token: token_address, amount, to: recipient });
        return { success: true, txHash: tx.hash, token: token_address, amount, to: recipient };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in erc4337_withdraw_token');
        throw e;
      }
    }
  }),

  erc4337_withdraw_native: tool({
    description: 'Withdraw native tokens from smart account',
    parameters: z.object({
      amount: z.string().describe('Amount of ETH to withdraw'),
      to: z.string().optional().describe('Recipient address'),
      context: z.string().describe('Reason for withdrawing native tokens.')
    }),
    // @ts-ignore
    execute: async ({ amount, to, context }: { amount: string; to?: string; context: string }) => {
      try {
        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const recipient = to || await signer.getAddress();
        
        const check = policyGuard.validateTransaction({
          toAddress: recipient,
          amount: amount,
          currentRiskLevel: 'LOW',
          portfolioValue: '1000000'
        });
        if (check.violated) {
          await reportToDashboard('erc4337_withdraw_native', { error: check.reason });
          return { error: check.reason };
        }

        const signerAddress = await signer.getAddress();
        const withdrawAmount = ethers.parseEther(amount);
        
        const accountContract = new ethers.Contract(signerAddress, ['function execute(address dest, uint256 value, bytes calldata func) external'], signer);
        const tx = await accountContract.execute(recipient, withdrawAmount, '0x');
        await tx.wait();
        
        await reportToDashboard('erc4337_withdraw_native', { txHash: tx.hash, amount, to: recipient });
        return { success: true, txHash: tx.hash, amount, to: recipient };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in erc4337_withdraw_native');
        throw e;
      }
    }
  }),

  erc4337_set_token_approval: tool({
    description: 'Set ERC-20 token approval for paymaster',
    parameters: z.object({
      token_address: z.string().describe('Token contract address'),
      paymaster_address: z.string().describe('Paymaster address'),
      context: z.string().describe('Reason for setting approval.')
    }),
    // @ts-ignore
    execute: async ({ token_address, paymaster_address, context }: { token_address: string; paymaster_address: string; context: string }) => {
      try {
        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, new ethers.JsonRpcProvider(env.BNB_RPC_URL));
        const signerAddress = await signer.getAddress();
        
        // Approve paymaster to spend tokens
        const erc20Interface = new ethers.Interface(['function approve(address spender, uint256 amount) external returns (bool)']);
        const data = erc20Interface.encodeFunctionData('approve', [paymaster_address, ethers.MaxUint256]);
        
        const accountContract = new ethers.Contract(signerAddress, ['function execute(address dest, uint256 value, bytes calldata func) external'], signer);
        const tx = await accountContract.execute(token_address, 0, data);
        await tx.wait();
        
        await reportToDashboard('erc4337_set_token_approval', { txHash: tx.hash, token: token_address, paymaster: paymaster_address });
        return { success: true, txHash: tx.hash, token: token_address, paymaster: paymaster_address };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in erc4337_set_token_approval');
        throw e;
      }
    }
  }),

  erc4337_is_token_approved: tool({
    description: 'Check if ERC-20 token is approved for paymaster',
    parameters: z.object({
      token_address: z.string().describe('Token contract address'),
      paymaster_address: z.string().describe('Paymaster address'),
      account_address: z.string().optional().describe('Account to check approval for'),
      context: z.string().describe('Reason for checking approval.')
    }),
    // @ts-ignore
    execute: async ({ token_address, paymaster_address, account_address, context }: { token_address: string; paymaster_address: string; account_address?: string; context: string }) => {
      try {
        const provider = new ethers.JsonRpcProvider(env.BNB_RPC_URL);
        const signer = ethers.Wallet.fromPhrase(env.WDK_SECRET_SEED, provider);
        const signerAddress = await signer.getAddress();
        const targetAddress = account_address || signerAddress;
        
        const erc20Contract = new ethers.Contract(token_address, ['function allowance(address owner, address spender) external view returns (uint256)'], provider);
        const allowance = await erc20Contract.allowance(targetAddress, paymaster_address);
        const isApproved = allowance > 0n;
        
        await reportToDashboard('erc4337_is_token_approved', { token: token_address, paymaster: paymaster_address, isApproved, allowance: allowance.toString() });
        return { success: true, token: token_address, paymaster: paymaster_address, isApproved, allowance: allowance.toString() };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in erc4337_is_token_approved');
        throw e;
      }
    }
  }),

  // ============================================
  // Robot Fleet Operations
  // ============================================

  robot_fleet_status: tool({
    description: 'Get the current status of the Robot Fleet including robot list, total earnings, and recent events.',
    parameters: z.object({
      context: z.string().describe('Reason for checking fleet status.')
    }),
    // @ts-ignore
    execute: async ({ context }: { context: string }) => {
      try {
        const status = robotFleetService.getFleetStatus();
        
        await reportToDashboard('robot_fleet_status', { 
          robotCount: status.robots.length, 
          fleetTotalEarned: status.fleetTotalEarned,
          enabled: status.enabled 
        });
        
        return {
          enabled: status.enabled,
          robots: status.robots,
          fleetTotalEarned: status.fleetTotalEarned,
          recentEvents: status.recentEvents,
          latestTxHash: status.latestTxHash,
          latestTxValue: status.latestTxValue
        };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in robot_fleet_status');
        throw e;
      }
    }
  }),

  robot_fleet_start: tool({
    description: 'Start the Robot Fleet simulator. This activates the fleet of robots that can perform tasks and earn yields.',
    parameters: z.object({
      context: z.string().describe('Reason for starting the fleet.')
    }),
    // @ts-ignore
    execute: async ({ context }: { context: string }) => {
      try {
        const currentStatus = robotFleetService.getFleetStatus();
        if (currentStatus.enabled) {
          return { success: true, message: 'Robot Fleet is already running', robots: currentStatus.robots };
        }
        
        await robotFleetService.startSimulator();
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const newStatus = robotFleetService.getFleetStatus();
        
        await reportToDashboard('robot_fleet_start', { 
          robotCount: newStatus.robots.length,
          fleetTotalEarned: newStatus.fleetTotalEarned 
        });
        
        return {
          success: true,
          message: 'Robot Fleet started successfully',
          robots: newStatus.robots,
          fleetTotalEarned: newStatus.fleetTotalEarned
        };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in robot_fleet_start');
        throw e;
      }
    }
  }),

  robot_fleet_get_events: tool({
    description: 'Get recent events from the Robot Fleet including task completions, earnings, and transactions.',
    parameters: z.object({
      limit: z.number().optional().describe('Maximum number of events to return (default: 10)'),
      context: z.string().describe('Reason for getting events.')
    }),
    // @ts-ignore
    execute: async ({ limit = 10, context }: { limit?: number; context: string }) => {
      try {
        const events = robotFleetService.getRecentEvents();
        
        const limitedEvents = events.slice(-limit);
        
        await reportToDashboard('robot_fleet_get_events', { 
          eventCount: limitedEvents.length 
        });
        
        return {
          success: true,
          events: limitedEvents,
          totalEvents: events.length
        };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in robot_fleet_get_events');
        throw e;
      }
    }
  }),

  robot_fleet_get_robots: tool({
    description: 'Get detailed information about all robots in the fleet including their status, earnings, and task count.',
    parameters: z.object({
      context: z.string().describe('Reason for getting robot information.')
    }),
    // @ts-ignore
    execute: async ({ context }: { context: string }) => {
      try {
        const robots = robotFleetService.getRobots();
        
        const status = robotFleetService.getFleetStatus();
        
        await reportToDashboard('robot_fleet_get_robots', { 
          robotCount: robots.length,
          workingCount: robots.filter(r => r.status === 'Working').length,
          idleCount: robots.filter(r => r.status === 'Idle').length
        });
        
        return {
          success: true,
          robots: robots,
          summary: {
            total: robots.length,
            working: robots.filter(r => r.status === 'Working').length,
            idle: robots.filter(r => r.status === 'Idle').length,
            totalEarned: status.fleetTotalEarned
          }
        };
      } catch (e: any) {
        logger.error(e, '[Tools] Error in robot_fleet_get_robots');
        throw e;
      }
    }
  })
};

// Proxy to normalize tool names (trim whitespace from AI model tool calls)
export const normalizedAgentTools = new Proxy(agentTools, {
  get(target, prop) {
    const trimmedProp = typeof prop === 'string' ? prop.trim() : prop;
    if (trimmedProp !== prop) {
      logger.debug({ original: prop, trimmed: trimmedProp }, '[Tools] Tool name had whitespace - normalizing');
    }
    const tool = target[trimmedProp as keyof typeof target];
    if (tool) return tool;
    return target[prop as keyof typeof target];
  }
});

/**
 * Extract tool metadata (name, description, parameters) for frontend consumption
 */
export interface ToolMetadata {
  name: string;
  description: string;
  parameters: string[];
}

export function getToolsMetadata(): ToolMetadata[] {
  const tools: ToolMetadata[] = [];
  
  for (const [name, toolDef] of Object.entries(agentTools)) {
    const def = toolDef as any;
    const parameters: string[] = [];
    
    // Extract parameter names from Zod schema
    if (def.parameters?._def?.shape) {
      try {
        const shape = def.parameters._def.shape();
        parameters.push(...Object.keys(shape).filter(k => k !== 'ZodDefault'));
      } catch (e) {
        // Ignore
      }
    }
    
    tools.push({
      name,
      description: def.description || `Tool: ${name}`,
      parameters
    });
  }
  
  return tools;
}

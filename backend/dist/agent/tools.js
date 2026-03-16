"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentTools = exports.wdk = void 0;
const ethers_1 = require("ethers");
const wdk_1 = __importDefault(require("@tetherto/wdk"));
const wdk_wallet_evm_1 = __importDefault(require("@tetherto/wdk-wallet-evm"));
const wdk_wallet_solana_1 = __importDefault(require("@tetherto/wdk-wallet-solana"));
const wdk_wallet_ton_1 = __importDefault(require("@tetherto/wdk-wallet-ton"));
const RiskService_1 = require("./services/RiskService");
const BridgeService_1 = require("./services/BridgeService");
const SimulationService_1 = require("./services/SimulationService");
const x402_client_1 = require("./x402-client");
const PolicyGuard_1 = require("./middleware/PolicyGuard");
const ProfitSimulator_1 = require("./services/ProfitSimulator");
const ai_1 = require("ai");
const zod_1 = require("zod");
const env_1 = require("../config/env");
const ethers_2 = require("../contracts/clients/ethers");
const axios_1 = __importDefault(require("axios"));
// Initialize WDK
exports.wdk = new wdk_1.default(env_1.env.WDK_SECRET_SEED);
exports.wdk.registerWallet('bnb', wdk_wallet_evm_1.default, { provider: env_1.env.BNB_RPC_URL });
exports.wdk.registerWallet('solana', wdk_wallet_solana_1.default, { rpcUrl: 'https://api.mainnet-beta.solana.com' });
exports.wdk.registerWallet('ton', wdk_wallet_ton_1.default, { rpcUrl: 'https://toncenter.com/api/v2/jsonRPC' });
const { engine, vault, usdt, zkOracle, breaker, auction } = (0, ethers_2.getContracts)();
const bridgeService = new BridgeService_1.BridgeService(exports.wdk);
const x402 = new x402_client_1.X402Client(exports.wdk, env_1.env.WDK_USDT_ADDRESS);
const profitSimulator = (0, ProfitSimulator_1.createProfitSimulator)(env_1.env.BNB_RPC_URL);
const policyGuard = (0, PolicyGuard_1.getPolicyGuard)();
// Helper to report agent state
async function reportToDashboard(node, details = {}) {
    const serverUrl = `http://localhost:${env_1.env.PORT}/api/agent/report`;
    try {
        await axios_1.default.post(serverUrl, {
            node,
            riskLevel: details.riskLevel || 'UNKNOWN',
            drawdown: details.drawdown || 0,
            action: details.action || 'PROCESSING',
            details
        }, { timeout: 2000 });
    }
    catch (e) { }
}
/**
 * Agent Tools Definition
 */
exports.agentTools = {
    get_vault_status: (0, ai_1.tool)({
        description: 'Get current status, total assets, health, and buffer utilization of the WDKVault.',
        parameters: zod_1.z.object({
            context: zod_1.z.string().describe('Reason/context for this action.')
        }),
        // @ts-ignore
        execute: async ({ context }) => {
            try {
                const assets = await vault.totalAssets();
                // Determine token decimals
                let tokenDecimals = 6;
                try {
                    tokenDecimals = await usdt.decimals();
                }
                catch (e) {
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
                    bufferTarget = Number(ethers_1.ethers.formatUnits(targetRaw, tokenDecimals));
                    bufferCurrent = Number(ethers_1.ethers.formatUnits(currentRaw, tokenDecimals));
                    bufferUtilizationBps = Number(utilizationRaw);
                }
                catch (e) {
                    console.warn("Could not fetch buffer status:", e);
                }
                const res = {
                    vault: await vault.getAddress(),
                    totalAssets: ethers_1.ethers.formatUnits(assets, tokenDecimals),
                    bufferUtilizationBps,
                    bufferCurrent,
                    bufferTarget,
                    status: "Healthy",
                    assetSymbol: "USD₮"
                };
                await reportToDashboard('getVaultStatus', res);
                return res;
            }
            catch (e) {
                return { error: "Failed to fetch vault assets", message: e.message };
            }
        },
    }),
    analyze_risk: (0, ai_1.tool)({
        description: 'Analyze the current ZK-risk parameters and return the risk profile level (LOW, MEDIUM, HIGH) and drawdown bps.',
        parameters: zod_1.z.object({
            context: zod_1.z.string().describe('Reason/context for this action.')
        }),
        // @ts-ignore
        execute: async ({ context }) => {
            const riskService = new RiskService_1.RiskService(zkOracle, breaker, exports.wdk);
            const profile = await riskService.getRiskProfile();
            await reportToDashboard('analyzeRisk', { riskLevel: profile.level, drawdown: profile.drawdownBps, ...profile });
            return profile;
        },
    }),
    handle_emergency: (0, ai_1.tool)({
        description: 'Execute an emergency shutdown/pause of the vault if high risk is detected.',
        parameters: zod_1.z.object({
            reason: zod_1.z.string().describe('The reason for the emergency shutdown.')
        }),
        // @ts-ignore
        execute: async ({ reason }) => {
            const riskService = new RiskService_1.RiskService(null, breaker, exports.wdk);
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
    check_strategy: (0, ai_1.tool)({
        description: 'Check if the strategy engine is ready for a rebalance cycle and preview the next decision.',
        parameters: zod_1.z.object({
            context: zod_1.z.string().describe('Reason/context for this action.')
        }),
        // @ts-ignore
        execute: async ({ context }) => {
            const [canExec, reason] = await engine.canExecute();
            const preview = await engine.previewDecision();
            const res = {
                canExecute: canExec,
                reason: canExec ? '' : (function () { try {
                    return ethers_1.ethers.decodeBytes32String(reason);
                }
                catch {
                    return 'UNKNOWN';
                } })(),
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
    execute_rebalance: (0, ai_1.tool)({
        description: 'Execute a tactical rebalance cycle. Handles Auction bidding if active, simulation, and AI risk scoring.',
        parameters: zod_1.z.object({
            context: zod_1.z.string().describe('Reason/context for this action.')
        }),
        // @ts-ignore
        execute: async ({ context }) => {
            const bnbAccount = await exports.wdk.getAccount('bnb');
            const fromAddress = await bnbAccount.getAddress();
            const riskService = new RiskService_1.RiskService(zkOracle, breaker, exports.wdk);
            const profile = await riskService.getRiskProfile();
            const policyViolation = policyGuard.validateSwapTransaction({
                fromToken: env_1.env.WDK_USDT_ADDRESS,
                toToken: env_1.env.WDK_ENGINE_ADDRESS,
                amount: '100000000',
                currentRiskLevel: profile.level,
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
            if (await auction.getAddress() !== ethers_1.ethers.ZeroAddress) {
                try {
                    const status = await auction.roundStatus();
                    const phase = Number(status.currentPhase);
                    if (phase === 1) { // BidPhase
                        const minBid = await auction.minBid();
                        const currentBid = status.winningBid;
                        const myBid = currentBid > 0n ? currentBid + (currentBid * 500n / 10000n) : minBid;
                        const allowance = await usdt.allowance(fromAddress, await auction.getAddress());
                        if (allowance < myBid) {
                            await bnbAccount.sendTransaction({
                                to: env_1.env.WDK_USDT_ADDRESS,
                                data: usdt.interface.encodeFunctionData("approve", [await auction.getAddress(), ethers_1.ethers.MaxUint256])
                            });
                        }
                        const bidTx = await bnbAccount.sendTransaction({
                            to: await auction.getAddress(),
                            data: auction.interface.encodeFunctionData("bid", [myBid])
                        });
                        return { actionTaken: 'AUCTION_BID_PLACED', txHash: bidTx.hash };
                    }
                    if (phase === 2 && status.winner.toLowerCase() === fromAddress.toLowerCase()) {
                        const execTx = await bnbAccount.sendTransaction({
                            to: await auction.getAddress(),
                            data: auction.interface.encodeFunctionData("winnerExecute", [])
                        });
                        return { actionTaken: 'AUCTION_EXECUTED_WINNER', txHash: execTx.hash };
                    }
                }
                catch (e) { }
            }
            // 2. Direct Execution with Simulation & AI Scoring
            const [canExec, reason] = await engine.canExecute();
            if (!canExec)
                return { actionTaken: 'SKIPPED_NOT_READY' };
            const txRequest = {
                to: await engine.getAddress(),
                from: fromAddress,
                data: engine.interface.encodeFunctionData("executeCycle", []),
                value: 0n
            };
            const simulator = new SimulationService_1.SimulationService(env_1.env.BNB_RPC_URL);
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
            });
            policyGuard.recordTransaction('100000000');
            const res = { actionTaken: 'REBALANCED', txHash: tx.hash, profitSimulation: profitSim };
            await reportToDashboard('executeRebalance', res);
            return res;
        },
    }),
    check_cross_chain_yields: (0, ai_1.tool)({
        description: 'Scout yields across BNB, Solana, and TON and move capital if an opportunity exists.',
        parameters: zod_1.z.object({
            threshold: zod_1.z.number().default(2.0).describe('Minimum yield premium to trigger a bridge.')
        }),
        // @ts-ignore
        execute: async ({ threshold }) => {
            const riskService = new RiskService_1.RiskService(zkOracle, breaker, exports.wdk);
            const profile = await riskService.getRiskProfile();
            const policyViolation = policyGuard.validateBridgeTransaction({
                fromChain: 'bnb',
                toChain: 'solana',
                amount: '100000000',
                currentRiskLevel: profile.level,
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
    process_x402_payment: (0, ai_1.tool)({
        description: 'Pay for infrastructure insights using x402 protocol.',
        parameters: zod_1.z.object({
            serviceUrl: zod_1.z.string().describe('The URL of the gated service.'),
            providerAddress: zod_1.z.string().describe('The Ethereum address of the provider.')
        }),
        // @ts-ignore
        execute: async ({ serviceUrl, providerAddress }) => {
            const riskService = new RiskService_1.RiskService(zkOracle, breaker, exports.wdk);
            const profile = await riskService.getRiskProfile();
            const policyViolation = policyGuard.validateSwapTransaction({
                fromToken: env_1.env.WDK_USDT_ADDRESS,
                toToken: providerAddress,
                amount: ethers_1.ethers.parseUnits("0.1", 6).toString(),
                currentRiskLevel: profile.level,
                portfolioValue: (await vault.totalAssets()).toString(),
                estimatedSlippageBps: 0,
            });
            if (policyViolation.violated) {
                console.warn(`[X402] Policy violation: ${policyViolation.reason}`);
                return { status: "failed", error: `Policy violation: ${policyViolation.reason}` };
            }
            try {
                const paymentAmount = ethers_1.ethers.parseUnits("0.1", 6).toString();
                const portfolioValue = await vault.totalAssets();
                const paymentSim = await profitSimulator.simulateSwap({
                    inputAmount: paymentAmount,
                    inputToken: env_1.env.WDK_USDT_ADDRESS,
                    outputToken: env_1.env.WDK_USDT_ADDRESS,
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
            }
            catch (e) {
                return { status: "failed", error: e.message };
            }
        },
    }),
    yield_sweep: (0, ai_1.tool)({
        description: 'Sweep accrued yield interest from the vault to the spending wallet.',
        parameters: zod_1.z.object({
            context: zod_1.z.string().describe('Reason/context for this action.')
        }),
        // @ts-ignore
        execute: async ({ context }) => {
            const bnbAccount = await exports.wdk.getAccount('bnb');
            const spendingAccount = await exports.wdk.getAccount('bnb', 1);
            const spendingAddress = await spendingAccount.getAddress();
            try {
                const myAddress = await bnbAccount.getAddress();
                const principal = await vault.userPrincipal(myAddress);
                const maxWithdrawable = await vault.maxWithdraw(myAddress);
                if (maxWithdrawable > principal && (maxWithdrawable - principal) > ethers_1.ethers.parseUnits("1", 6)) {
                    const yieldAmount = maxWithdrawable - principal;
                    const portfolioValue = await vault.totalAssets();
                    const yieldSim = await profitSimulator.simulateSwap({
                        inputAmount: yieldAmount.toString(),
                        inputToken: env_1.env.WDK_USDT_ADDRESS,
                        outputToken: env_1.env.WDK_USDT_ADDRESS,
                        expectedOutput: yieldAmount.toString(),
                        slippage: 0,
                    });
                    console.log(`[YieldSweep] Yield simulation: ${JSON.stringify(yieldSim)}`);
                    const tx = await bnbAccount.sendTransaction({
                        to: await vault.getAddress(),
                        data: vault.interface.encodeFunctionData("withdrawYield", [spendingAddress])
                    });
                    policyGuard.recordTransaction(yieldAmount.toString());
                    const res = {
                        actionTaken: 'YIELD_SWEPT',
                        txHash: tx.hash,
                        recipient: spendingAddress,
                        yieldAmount: ethers_1.ethers.formatUnits(yieldAmount, 6),
                        profitSimulation: yieldSim
                    };
                    await reportToDashboard('yieldSweep', res);
                    return res;
                }
                return { actionTaken: 'SKIPPED', message: "No yield to sweep." };
            }
            catch (e) {
                return { error: "Yield sweep failed", message: e.message };
            }
        },
    })
};

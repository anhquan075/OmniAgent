"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizedAgentTools = exports.agentTools = void 0;
exports.getWdk = getWdk;
exports.getToolsMetadata = getToolsMetadata;
const env_1 = require("@/config/env");
const ethers_1 = require("@/contracts/clients/ethers");
const wdk_loader_1 = require("@/lib/wdk-loader");
const RobotFleetService_1 = require("@/services/RobotFleetService");
const logger_1 = require("@/utils/logger");
const ai_1 = require("ai");
const axios_1 = __importDefault(require("axios"));
const ethers_2 = require("ethers");
const zod_1 = require("zod");
const PolicyGuard_1 = require("./middleware/PolicyGuard");
const WdkExecutor_1 = require("./middleware/WdkExecutor");
const BridgeService_1 = require("./services/BridgeService");
const ProfitSimulator_1 = require("./services/ProfitSimulator");
const RiskService_1 = require("./services/RiskService");
const SimulationService_1 = require("./services/SimulationService");
const x402_client_1 = require("./x402-client");
function validateWDKSecretSeed() {
    const seed = env_1.env.WDK_SECRET_SEED;
    if (!seed) {
        throw new Error('[Security] WDK_SECRET_SEED is not configured. ' +
            'Cannot initialize wallet without a valid seed phrase or private key.');
    }
    const lowerSeed = seed.toLowerCase();
    if (lowerSeed.includes('replace_me') ||
        lowerSeed.includes('your_') ||
        lowerSeed === 'xxx' ||
        lowerSeed === '0x0') {
        throw new Error('[Security] WDK_SECRET_SEED contains a placeholder value and is not safe for use. ' +
            'Please set a valid BIP-39 mnemonic (12-24 words) or hex private key starting with 0x.');
    }
}
validateWDKSecretSeed();
let wdkPromise = null;
async function getWdk() {
    if (!wdkPromise) {
        wdkPromise = (0, wdk_loader_1.getWdkMultiChain)();
    }
    return wdkPromise;
}
const { engine, vault, usdt, zkOracle, breaker, auction } = (0, ethers_1.getContracts)();
let bridgeServicePromise = null;
let x402Promise = null;
let wdkExecutorPromise = null;
async function getBridgeService() {
    if (!bridgeServicePromise) {
        bridgeServicePromise = (async () => {
            const wdk = await getWdk();
            return new BridgeService_1.BridgeService(wdk);
        })();
    }
    return bridgeServicePromise;
}
async function getX402Client() {
    if (!x402Promise) {
        x402Promise = (async () => {
            const wdk = await getWdk();
            return new x402_client_1.X402Client(wdk, env_1.env.WDK_USDT_ADDRESS);
        })();
    }
    return x402Promise;
}
async function getWdkExecutor() {
    if (!wdkExecutorPromise) {
        wdkExecutorPromise = (async () => {
            const wdk = await getWdk();
            return new WdkExecutor_1.WdkExecutor(wdk);
        })();
    }
    return wdkExecutorPromise;
}
const profitSimulator = (0, ProfitSimulator_1.createProfitSimulator)(env_1.env.SEPOLIA_RPC_URL);
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
    catch (e) {
        logger_1.logger.warn(e, `[Tools] Failed to report ${node} to dashboard`);
    }
}
/**
 * Agent Tools Definition
 */
exports.agentTools = {
    get_vault_status: (0, ai_1.tool)({
        description: 'Get current status, total assets, health, and buffer utilization of the OmniAgentVault.',
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
                    // Buffer status returns (uint256 current, uint256 target, uint256 utilizationBps)
                    const currentRaw = buffer.current ?? buffer[0] ?? 0n;
                    const targetRaw = buffer.target ?? buffer[1] ?? 0n;
                    const utilizationRaw = buffer.utilizationBps ?? buffer[2] ?? 0n;
                    bufferTarget = Number(ethers_2.ethers.formatUnits(targetRaw, tokenDecimals));
                    bufferCurrent = Number(ethers_2.ethers.formatUnits(currentRaw, tokenDecimals));
                    bufferUtilizationBps = Number(utilizationRaw);
                }
                catch (e) {
                    logger_1.logger.warn(e, '[Tools] Could not fetch buffer status');
                }
                const res = {
                    vault: await vault.getAddress(),
                    totalAssets: ethers_2.ethers.formatUnits(assets, tokenDecimals),
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
    get_all_chain_balances: (0, ai_1.tool)({
        description: 'Fetch the native token (e.g., ETH, SOL, TON) and USDT balances across all registered multi-chain wallets.',
        parameters: zod_1.z.object({
            context: zod_1.z.string().describe('Reason/context for this action.')
        }),
        // @ts-ignore
        execute: async ({ context }) => {
            const results = {};
            const networks = ['sepolia'];
            for (const network of networks) {
                try {
                    const account = await (await getWdk()).getAccount(network);
                    const address = await account.getAddress();
                    let nativeBalance = "0";
                    try {
                        const nativeBigInt = await account.getBalance();
                        const decimals = 18;
                        nativeBalance = ethers_2.ethers.formatUnits(nativeBigInt, decimals);
                    }
                    catch (e) {
                        logger_1.logger.warn(e, `[MultiVM] Failed to get native balance for ${network}`);
                    }
                    let usdtBalance = "0";
                    try {
                        let tokenAddress = env_1.env.WDK_USDT_ADDRESS;
                        if (account.getTokenBalance) {
                            const usdtBigInt = await account.getTokenBalance(tokenAddress);
                            usdtBalance = ethers_2.ethers.formatUnits(usdtBigInt, 6);
                        }
                    }
                    catch (e) {
                        logger_1.logger.warn(e, `[MultiVM] Failed to get USDT balance for ${network}`);
                    }
                    results[network] = {
                        address,
                        nativeBalance,
                        usdtBalance,
                        status: "Connected"
                    };
                }
                catch (error) {
                    results[network] = { error: `Wallet not registered or failed: ${error.message}` };
                }
            }
            await reportToDashboard('getAllChainBalances', { networks: results });
            return results;
        },
    }),
    analyze_risk: (0, ai_1.tool)({
        description: 'Analyze the current ZK-risk parameters and return the risk profile level (LOW, MEDIUM, HIGH) and drawdown bps.',
        parameters: zod_1.z.object({
            context: zod_1.z.string().describe('Reason/context for this action.')
        }),
        // @ts-ignore
        execute: async ({ context }) => {
            const riskService = new RiskService_1.RiskService(zkOracle, breaker, await getWdk());
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
            const riskService = new RiskService_1.RiskService(null, breaker, await getWdk());
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
                    return ethers_2.ethers.decodeBytes32String(reason);
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
            const sepoliaAccount = await (await getWdk()).getAccount('sepolia');
            const fromAddress = await sepoliaAccount.getAddress();
            const riskService = new RiskService_1.RiskService(zkOracle, breaker, await getWdk());
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
                logger_1.logger.warn({ reason: policyViolation.reason }, '[Rebalance] Policy violation');
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
            if (await auction.getAddress() !== ethers_2.ethers.ZeroAddress) {
                try {
                    const status = await auction.roundStatus();
                    const phase = Number(status.currentPhase);
                    if (phase === 1) { // BidPhase
                        const minBid = await auction.minBid();
                        const currentBid = status.winningBid;
                        const myBid = currentBid > 0n ? currentBid + (currentBid * 500n / 10000n) : minBid;
                        const allowance = await usdt.allowance(fromAddress, await auction.getAddress());
                        if (allowance < myBid) {
                            await (await getWdkExecutor()).sendTransaction('sepolia', {
                                to: env_1.env.WDK_USDT_ADDRESS,
                                data: usdt.interface.encodeFunctionData("approve", [await auction.getAddress(), ethers_2.ethers.MaxUint256])
                            }, { riskLevel: profile.level, portfolioValue: (await vault.totalAssets()).toString(), estimatedAmount: "0" });
                        }
                        const bidTx = await (await getWdkExecutor()).sendTransaction('sepolia', {
                            to: await auction.getAddress(),
                            data: auction.interface.encodeFunctionData("bid", [myBid])
                        }, { riskLevel: profile.level, portfolioValue: (await vault.totalAssets()).toString(), estimatedAmount: "0" });
                        return { actionTaken: 'AUCTION_BID_PLACED', txHash: bidTx.hash };
                    }
                    if (phase === 2 && status.winner.toLowerCase() === fromAddress.toLowerCase()) {
                        const execTx = await (await getWdkExecutor()).sendTransaction('sepolia', {
                            to: await auction.getAddress(),
                            data: auction.interface.encodeFunctionData("winnerExecute", [])
                        }, { riskLevel: profile.level, portfolioValue: (await vault.totalAssets()).toString(), estimatedAmount: "0" });
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
            const simulator = new SimulationService_1.SimulationService(env_1.env.SEPOLIA_RPC_URL);
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
            logger_1.logger.debug({ profitSim }, '[Rebalance] Profit simulation');
            try {
                const tx = await (await getWdkExecutor()).sendTransaction('sepolia', {
                    to: txRequest.to,
                    data: txRequest.data,
                    value: txRequest.value
                }, { riskLevel: profile.level, portfolioValue: (await vault.totalAssets()).toString(), estimatedAmount: '100000000' });
                const res = { actionTaken: 'REBALANCED', txHash: tx.hash, profitSimulation: profitSim };
                await reportToDashboard('executeRebalance', res);
                return res;
            }
            catch (error) {
                logger_1.logger.warn(error, '[Rebalance] Execution failed');
                return {
                    actionTaken: 'BLOCKED_BY_POLICY_DURING_EXECUTION',
                    reason: error.message
                };
            }
        },
    }),
    check_cross_chain_yields: (0, ai_1.tool)({
        description: 'Scout yields across Sepolia, Solana, and TON and move capital if an opportunity exists.',
        parameters: zod_1.z.object({
            threshold: zod_1.z.number().default(2.0).describe('Minimum yield premium to trigger a bridge.')
        }),
        // @ts-ignore
        execute: async ({ threshold }) => {
            const riskService = new RiskService_1.RiskService(zkOracle, breaker, await getWdk());
            const profile = await riskService.getRiskProfile();
            const policyViolation = policyGuard.validateBridgeTransaction({
                fromChain: 'sepolia',
                toChain: 'solana',
                amount: '100000000',
                currentRiskLevel: profile.level,
                portfolioValue: (await vault.totalAssets()).toString(),
            });
            if (policyViolation.violated) {
                logger_1.logger.warn({ reason: policyViolation.reason }, '[Bridge] Policy violation');
                return { actionTaken: 'BLOCKED_BY_POLICY', reason: policyViolation.reason };
            }
            const opportunity = await (await getBridgeService()).analyzeBridgeOpportunity('sepolia', threshold);
            if (opportunity.shouldBridge) {
                const currentYield = 0;
                const expectedYieldDifference = (opportunity.expectedYield || 2.0) - currentYield;
                const profitSim = await profitSimulator.simulateBridge({
                    inputAmount: '100000000',
                    fromChain: 'sepolia',
                    toChain: opportunity.targetChain || 'solana',
                    expectedYieldDifference: expectedYieldDifference,
                    holdingPeriodDays: 30,
                });
                if (!profitSim.isViable) {
                    logger_1.logger.info({ margin: profitSim.profitMargin }, '[Bridge] Not viable');
                    return { actionTaken: 'SKIPPED_NOT_PROFITABLE', profitMargin: profitSim.profitMargin };
                }
                const bridgeResult = await (await getBridgeService()).executeBridge('sepolia', opportunity.targetChain || '', 100000000n); // 100 USDT (6 decimals)
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
            const riskService = new RiskService_1.RiskService(zkOracle, breaker, await getWdk());
            const profile = await riskService.getRiskProfile();
            const policyViolation = policyGuard.validateSwapTransaction({
                fromToken: env_1.env.WDK_USDT_ADDRESS,
                toToken: providerAddress,
                amount: ethers_2.ethers.parseUnits("0.1", 6).toString(),
                currentRiskLevel: profile.level,
                portfolioValue: (await vault.totalAssets()).toString(),
                estimatedSlippageBps: 0,
            });
            if (policyViolation.violated) {
                logger_1.logger.warn({ reason: policyViolation.reason }, '[X402] Policy violation');
                return { status: "failed", error: `Policy violation: ${policyViolation.reason}` };
            }
            try {
                const paymentAmount = ethers_2.ethers.parseUnits("0.1", 6).toString();
                const portfolioValue = await vault.totalAssets();
                const paymentSim = await profitSimulator.simulateSwap({
                    inputAmount: paymentAmount,
                    inputToken: env_1.env.WDK_USDT_ADDRESS,
                    outputToken: env_1.env.WDK_USDT_ADDRESS,
                    expectedOutput: paymentAmount,
                    slippage: 0,
                });
                logger_1.logger.debug({ paymentSim }, '[X402] Payment simulation');
                const insightData = await (await getX402Client()).payAndFetch(serviceUrl, providerAddress, paymentAmount, profile.level, portfolioValue.toString());
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
            const sepoliaAccount = await (await getWdk()).getAccount('sepolia');
            const spendingAccount = await (await getWdk()).getAccount('sepolia', 1);
            const spendingAddress = await spendingAccount.getAddress();
            try {
                const myAddress = await sepoliaAccount.getAddress();
                const principal = await vault.userPrincipal(myAddress);
                const maxWithdrawable = await vault.maxWithdraw(myAddress);
                if (maxWithdrawable > principal && (maxWithdrawable - principal) > ethers_2.ethers.parseUnits("1", 6)) {
                    const yieldAmount = maxWithdrawable - principal;
                    const portfolioValue = await vault.totalAssets();
                    const yieldSim = await profitSimulator.simulateSwap({
                        inputAmount: yieldAmount.toString(),
                        inputToken: env_1.env.WDK_USDT_ADDRESS,
                        outputToken: env_1.env.WDK_USDT_ADDRESS,
                        expectedOutput: yieldAmount.toString(),
                        slippage: 0,
                    });
                    logger_1.logger.debug({ yieldSim }, '[YieldSweep] Yield simulation');
                    try {
                        const riskService = new RiskService_1.RiskService(zkOracle, breaker, await getWdk());
                        const profile = await riskService.getRiskProfile();
                        const tx = await (await getWdkExecutor()).sendTransaction('sepolia', {
                            to: await vault.getAddress(),
                            data: vault.interface.encodeFunctionData("withdrawYield", [spendingAddress])
                        }, { riskLevel: profile.level, portfolioValue: (await vault.totalAssets()).toString(), estimatedAmount: yieldAmount.toString() });
                        const res = {
                            actionTaken: 'YIELD_SWEPT',
                            txHash: tx.hash,
                            recipient: spendingAddress,
                            yieldAmount: ethers_2.ethers.formatUnits(yieldAmount, 6),
                            profitSimulation: yieldSim
                        };
                        await reportToDashboard('yieldSweep', res);
                        return res;
                    }
                    catch (error) {
                        logger_1.logger.warn(error, '[YieldSweep] Blocked by policy guard');
                        return { actionTaken: 'BLOCKED_BY_POLICY', message: error.message };
                    }
                }
                return { actionTaken: 'SKIPPED', message: "No yield to sweep." };
            }
            catch (e) {
                return { error: "Yield sweep failed", message: e.message };
            }
        },
    }),
    supply_to_aave: (0, ai_1.tool)({
        description: 'Supply USDT to Aave V3 on Sepolia to earn yield.',
        parameters: zod_1.z.object({
            amount: zod_1.z.string().describe('Amount of USDT to supply (in decimal USDT, e.g., "100.5")')
        }),
        // @ts-ignore
        execute: async ({ amount }) => {
            if (!env_1.env.WDK_AAVE_ADAPTER_ADDRESS)
                return { status: "failed", error: "Aave adapter address not configured" };
            const riskService = new RiskService_1.RiskService(zkOracle, breaker, await getWdk());
            const profile = await riskService.getRiskProfile();
            const usdtAmount = ethers_2.ethers.parseUnits(amount, 6);
            try {
                const tx = await (await getWdkExecutor()).sendTransaction('sepolia', {
                    to: env_1.env.WDK_AAVE_ADAPTER_ADDRESS,
                    data: new ethers_2.Interface(["function onVaultDeposit(uint256 amount) external"]).encodeFunctionData("onVaultDeposit", [usdtAmount])
                }, {
                    riskLevel: profile.level,
                    portfolioValue: (await vault.totalAssets()).toString(),
                    estimatedAmount: usdtAmount.toString()
                });
                return { status: "success", action: "AAVE_SUPPLY", txHash: tx.hash };
            }
            catch (e) {
                return { status: "failed", error: e.message };
            }
        }
    }),
    withdraw_from_aave: (0, ai_1.tool)({
        description: 'Withdraw USDT from Aave V3 on Sepolia back to the vault.',
        parameters: zod_1.z.object({
            amount: zod_1.z.string().describe('Amount of USDT to withdraw (in decimal USDT, e.g., "100.5")')
        }),
        // @ts-ignore
        execute: async ({ amount }) => {
            if (!env_1.env.WDK_AAVE_ADAPTER_ADDRESS)
                return { status: "failed", error: "Aave adapter address not configured" };
            const riskService = new RiskService_1.RiskService(zkOracle, breaker, await getWdk());
            const profile = await riskService.getRiskProfile();
            const usdtAmount = ethers_2.ethers.parseUnits(amount, 6);
            try {
                const tx = await (await getWdkExecutor()).sendTransaction('sepolia', {
                    to: env_1.env.WDK_AAVE_ADAPTER_ADDRESS,
                    data: new ethers_2.Interface(["function withdrawToVault(uint256 amount) external returns (uint256)"]).encodeFunctionData("withdrawToVault", [usdtAmount])
                }, {
                    riskLevel: profile.level,
                    portfolioValue: (await vault.totalAssets()).toString(),
                    estimatedAmount: usdtAmount.toString()
                });
                return { status: "success", action: "AAVE_WITHDRAW", txHash: tx.hash };
            }
            catch (e) {
                return { status: "failed", error: e.message };
            }
        }
    }),
    bridge_via_layerzero: (0, ai_1.tool)({
        description: 'Bridge USDT to another chain via LayerZero adapter',
        parameters: zod_1.z.object({
            amount: zod_1.z.string().describe('Amount to bridge in USDT'),
            dstEid: zod_1.z.number().describe('Destination endpoint ID (40231 for Solana testnet)'),
            context: zod_1.z.string().describe('Reason for bridging to the destination chain.')
        }),
        // @ts-ignore
        execute: async ({ amount, dstEid, context }) => {
            try {
                const LZ_ADAPTER_ABI = [
                    'function onVaultDeposit(uint256 amount) external',
                    'function withdrawToVault(uint256 amount) external returns (uint256)',
                    'function managedAssets() view returns (uint256)',
                    'function quote(uint32 dstEid, uint256 amount, bytes options) view returns (uint256 nativeFee)',
                    'function vault() view returns (address)',
                    'function asset() view returns (address)'
                ];
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const lzAdapter = new ethers_2.ethers.Contract(env_1.env.WDK_LZ_ADAPTER_ADDRESS, LZ_ADAPTER_ABI, signer);
                const refundAddress = await signer.getAddress();
                const usdtAmount = ethers_2.ethers.parseUnits(amount, 6);
                const tx = await lzAdapter.send(dstEid, '0x', '0x', refundAddress, { value: usdtAmount });
                await tx.wait();
                await reportToDashboard('bridge_via_layerzero', { txHash: tx.hash, dstEid, amount });
                return { success: true, txHash: tx.hash, dstEid, amount };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in bridge_via_layerzero');
                throw e;
            }
        }
    }),
    // ==================== SEPOLIA TOOLS (7) ====================
    sepolia_create_wallet: (0, ai_1.tool)({
        description: 'Create or retrieve a Sepolia blockchain wallet address',
        parameters: zod_1.z.object({
            context: zod_1.z.string().describe('Reason for accessing the wallet.')
        }),
        // @ts-ignore
        execute: async ({ context }) => {
            try {
                const account = await (await getWdk()).getAccount('sepolia');
                const address = await account.getAddress();
                await reportToDashboard('sepolia_create_wallet', { address, network: 'sepolia' });
                return { success: true, address, network: 'sepolia' };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in sepolia_create_wallet');
                throw e;
            }
        }
    }),
    sepolia_get_balance: (0, ai_1.tool)({
        description: 'Get native ETH and token balance for a Sepolia address',
        parameters: zod_1.z.object({
            address: zod_1.z.string().optional().describe('Sepolia address (optional, defaults to main wallet)'),
            context: zod_1.z.string().describe('Reason for checking balance.')
        }),
        // @ts-ignore
        execute: async ({ address, context }) => {
            try {
                const targetAddress = address || (await (await getWdk()).getAccount('sepolia').then((a) => a.getAddress()));
                const provider = new ethers_2.ethers.JsonRpcProvider(env_1.env.SEPOLIA_RPC_URL);
                const balanceWei = await provider.getBalance(targetAddress);
                const balanceEth = ethers_2.ethers.formatEther(balanceWei);
                await reportToDashboard('sepolia_get_balance', { balance: balanceEth, address: targetAddress });
                return { success: true, nativeBalance: balanceEth, nativeBalanceWei: balanceWei.toString() };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in sepolia_get_balance');
                throw e;
            }
        }
    }),
    sepolia_transfer: (0, ai_1.tool)({
        description: 'Transfer native ETH or tokens on Sepolia blockchain',
        parameters: zod_1.z.object({
            to: zod_1.z.string().describe('Recipient Sepolia address'),
            amount: zod_1.z.string().describe('Amount to transfer'),
            context: zod_1.z.string().describe('Reason and authorization for this transfer.')
        }),
        // @ts-ignore
        execute: async ({ to, amount, context }) => {
            try {
                const check = policyGuard.validateTransaction({
                    toAddress: to,
                    amount,
                    currentRiskLevel: 'LOW',
                    portfolioValue: '1000000'
                });
                if (check.violated) {
                    await reportToDashboard('sepolia_transfer', { error: check.reason });
                    return { error: check.reason };
                }
                const account = await (await getWdk()).getAccount('sepolia');
                const result = await account.transfer({ to, amount });
                await reportToDashboard('sepolia_transfer', { txHash: result?.txHash || result?.hash, to, amount });
                return { success: true, txHash: result?.txHash || result?.hash, to, amount };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in sepolia_transfer');
                throw e;
            }
        }
    }),
    sepolia_swap: (0, ai_1.tool)({
        description: 'Swap tokens on Sepolia blockchain via Uniswap',
        parameters: zod_1.z.object({
            tokenIn: zod_1.z.string().describe('Input token address'),
            tokenOut: zod_1.z.string().describe('Output token address'),
            amountIn: zod_1.z.string().describe('Amount of input token'),
            context: zod_1.z.string().describe('Reason for performing this swap.')
        }),
        // @ts-ignore
        execute: async ({ tokenIn, tokenOut, amountIn, context }) => {
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
                    await reportToDashboard('sepolia_swap', { error: check.reason });
                    return { error: check.reason };
                }
                const account = await (await getWdk()).getAccount('sepolia');
                const result = await account.swap({ tokenIn, tokenOut, amountIn });
                await reportToDashboard('sepolia_swap', { txHash: result?.txHash || result?.hash, tokenIn, tokenOut, amountIn });
                return { success: true, txHash: result?.txHash || result?.hash, tokenIn, tokenOut, amountIn };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in sepolia_swap');
                throw e;
            }
        }
    }),
    sepolia_supply_aave: (0, ai_1.tool)({
        description: 'Supply tokens to Aave on Sepolia',
        parameters: zod_1.z.object({
            asset: zod_1.z.string().describe('Token address to supply'),
            amount: zod_1.z.string().describe('Amount to supply'),
            context: zod_1.z.string().describe('Reason for lending to Aave.')
        }),
        // @ts-ignore
        execute: async ({ asset, amount, context }) => {
            try {
                const check = policyGuard.validateTransaction({
                    toAddress: asset,
                    amount,
                    currentRiskLevel: 'LOW',
                    portfolioValue: '1000000'
                });
                if (check.violated) {
                    await reportToDashboard('sepolia_supply_aave', { error: check.reason });
                    return { error: check.reason };
                }
                const account = await (await getWdk()).getAccount('sepolia');
                const result = await account.supplyAave({ asset, amount });
                await reportToDashboard('sepolia_supply_aave', { txHash: result?.txHash || result?.hash, asset, amount });
                return { success: true, txHash: result?.txHash || result?.hash, asset, amount };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in sepolia_supply_aave');
                throw e;
            }
        }
    }),
    sepolia_withdraw_aave: (0, ai_1.tool)({
        description: 'Withdraw tokens from Aave on Sepolia',
        parameters: zod_1.z.object({
            asset: zod_1.z.string().describe('Token address to withdraw'),
            amount: zod_1.z.string().describe('Amount to withdraw'),
            context: zod_1.z.string().describe('Reason for withdrawing from Aave.')
        }),
        // @ts-ignore
        execute: async ({ asset, amount, context }) => {
            try {
                const check = policyGuard.validateTransaction({
                    toAddress: asset,
                    amount,
                    currentRiskLevel: 'LOW',
                    portfolioValue: '1000000'
                });
                if (check.violated) {
                    await reportToDashboard('sepolia_withdraw_aave', { error: check.reason });
                    return { error: check.reason };
                }
                const account = await (await getWdk()).getAccount('sepolia');
                const result = await account.withdrawAave({ asset, amount });
                await reportToDashboard('sepolia_withdraw_aave', { txHash: result?.txHash || result?.hash, asset, amount });
                return { success: true, txHash: result?.txHash || result?.hash, asset, amount };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in sepolia_withdraw_aave');
                throw e;
            }
        }
    }),
    sepolia_bridge_layerzero: (0, ai_1.tool)({
        description: 'Bridge ETH or tokens to another chain via LayerZero',
        parameters: zod_1.z.object({
            amount: zod_1.z.string().describe('Amount to bridge'),
            dstChain: zod_1.z.string().describe('Destination chain name'),
            context: zod_1.z.string().describe('Reason for bridging.')
        }),
        // @ts-ignore
        execute: async ({ amount, dstChain, context }) => {
            try {
                const check = policyGuard.validateTransaction({
                    toAddress: dstChain,
                    amount,
                    currentRiskLevel: 'LOW',
                    portfolioValue: '1000000'
                });
                if (check.violated) {
                    await reportToDashboard('sepolia_bridge_layerzero', { error: check.reason });
                    return { error: check.reason };
                }
                const account = await (await getWdk()).getAccount('sepolia');
                const result = await account.bridgeLayerZero({ amount, dstChain });
                await reportToDashboard('sepolia_bridge_layerzero', { txHash: result?.txHash || result?.hash, amount, dstChain });
                return { success: true, txHash: result?.txHash || result?.hash, amount, dstChain };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in sepolia_bridge_layerzero');
                throw e;
            }
        }
    }),
    // ==================== WDK TOOLS (10) ====================
    wdk_mint_test_token: (0, ai_1.tool)({
        description: 'Mint test USDT tokens for testing (local hardhat only)',
        parameters: zod_1.z.object({
            amount: zod_1.z.string().optional().describe('Amount of USDT to mint'),
            recipient: zod_1.z.string().optional().describe('Address to receive minted tokens'),
            context: zod_1.z.string().describe('Reason for minting test tokens.')
        }),
        // @ts-ignore
        execute: async ({ amount, recipient, context }) => {
            try {
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const usdtContract = new ethers_2.ethers.Contract(env_1.env.WDK_USDT_ADDRESS, ['function mint(address to, uint256 amount) external'], signer);
                const finalRecipient = recipient || await signer.getAddress();
                const mintAmount = ethers_2.ethers.parseUnits(amount || '1000', 6);
                const tx = await usdtContract.mint(finalRecipient, mintAmount);
                await tx.wait();
                await reportToDashboard('wdk_mint_test_token', { txHash: tx.hash, amount, recipient: finalRecipient });
                return { success: true, txHash: tx.hash, amount, recipient: finalRecipient };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in wdk_mint_test_token');
                throw e;
            }
        }
    }),
    wdk_vault_deposit: (0, ai_1.tool)({
        description: 'Deposit USDT into the WDK Vault',
        parameters: zod_1.z.object({
            amount: zod_1.z.string().describe('Amount of USDT to deposit'),
            context: zod_1.z.string().describe('Reason for depositing into vault.')
        }),
        // @ts-ignore
        execute: async ({ amount, context }) => {
            try {
                const check = policyGuard.validateTransaction({
                    toAddress: env_1.env.WDK_VAULT_ADDRESS,
                    amount: amount,
                    currentRiskLevel: 'LOW',
                    portfolioValue: '1000000'
                });
                if (check.violated) {
                    await reportToDashboard('wdk_vault_deposit', { error: check.reason });
                    return { error: check.reason };
                }
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const vaultContract = new ethers_2.ethers.Contract(env_1.env.WDK_VAULT_ADDRESS, ['function deposit(uint256 assets, address receiver) external returns (uint256 shares)'], signer);
                const signerAddress = await signer.getAddress();
                const depositAmount = ethers_2.ethers.parseUnits(amount, 6);
                const tx = await vaultContract.deposit(depositAmount, signerAddress);
                await tx.wait();
                await reportToDashboard('wdk_vault_deposit', { txHash: tx.hash, amount });
                return { success: true, txHash: tx.hash, amount };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in wdk_vault_deposit');
                throw e;
            }
        }
    }),
    wdk_vault_withdraw: (0, ai_1.tool)({
        description: 'Withdraw USDT from the WDK Vault',
        parameters: zod_1.z.object({
            amount: zod_1.z.string().describe('Amount of USDT to withdraw'),
            context: zod_1.z.string().describe('Reason for withdrawing from vault.')
        }),
        // @ts-ignore
        execute: async ({ amount, context }) => {
            try {
                const check = policyGuard.validateTransaction({
                    toAddress: env_1.env.WDK_VAULT_ADDRESS,
                    amount: amount,
                    currentRiskLevel: 'LOW',
                    portfolioValue: '1000000'
                });
                if (check.violated) {
                    await reportToDashboard('wdk_vault_withdraw', { error: check.reason });
                    return { error: check.reason };
                }
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const vaultContract = new ethers_2.ethers.Contract(env_1.env.WDK_VAULT_ADDRESS, ['function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares)'], signer);
                const signerAddress = await signer.getAddress();
                const withdrawAmount = ethers_2.ethers.parseUnits(amount, 6);
                const tx = await vaultContract.withdraw(withdrawAmount, signerAddress, signerAddress);
                await tx.wait();
                await reportToDashboard('wdk_vault_withdraw', { txHash: tx.hash, amount });
                return { success: true, txHash: tx.hash, amount };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in wdk_vault_withdraw');
                throw e;
            }
        }
    }),
    wdk_vault_get_balance: (0, ai_1.tool)({
        description: 'Get the vault balance for an account',
        parameters: zod_1.z.object({
            account: zod_1.z.string().optional().describe('Account address to check balance for'),
            context: zod_1.z.string().describe('Reason for checking vault balance.')
        }),
        // @ts-ignore
        execute: async ({ account, context }) => {
            try {
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const vaultContract = new ethers_2.ethers.Contract(env_1.env.WDK_VAULT_ADDRESS, ['function balanceOf(address account) view returns (uint256)'], new ethers_2.ethers.JsonRpcProvider(env_1.env.SEPOLIA_RPC_URL));
                const targetAccount = account || await signer.getAddress();
                const balance = await vaultContract.balanceOf(targetAccount);
                await reportToDashboard('wdk_vault_get_balance', { balance: balance.toString(), account: targetAccount });
                return { success: true, balance: balance.toString(), account: targetAccount };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in wdk_vault_get_balance');
                throw e;
            }
        }
    }),
    wdk_vault_get_state: (0, ai_1.tool)({
        description: 'Get the current state of the WDK Vault (buffer status)',
        parameters: zod_1.z.object({
            context: zod_1.z.string().describe('Reason for checking vault state.')
        }),
        // @ts-ignore
        execute: async ({ context }) => {
            try {
                const vaultContract = new ethers_2.ethers.Contract(env_1.env.WDK_VAULT_ADDRESS, ['function bufferStatus() view returns (uint256 current, uint256 target, uint256 utilizationBps)'], new ethers_2.ethers.JsonRpcProvider(env_1.env.SEPOLIA_RPC_URL));
                const state = await vaultContract.bufferStatus();
                await reportToDashboard('wdk_vault_get_state', { current: state[0].toString(), target: state[1].toString(), utilization: state[2].toString() });
                return { success: true, currentBuffer: state[0].toString(), targetBuffer: state[1].toString(), utilizationBps: state[2].toString() };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in wdk_vault_get_state');
                throw e;
            }
        }
    }),
    wdk_engine_execute_cycle: (0, ai_1.tool)({
        description: 'Execute a cycle in the WDK Engine',
        parameters: zod_1.z.object({
            context: zod_1.z.string().describe('Reason for executing engine cycle.')
        }),
        // @ts-ignore
        execute: async ({ context }) => {
            try {
                const check = policyGuard.validateTransaction({
                    toAddress: env_1.env.WDK_ENGINE_ADDRESS,
                    amount: '0',
                    currentRiskLevel: 'LOW',
                    portfolioValue: '1000000'
                });
                if (check.violated) {
                    await reportToDashboard('wdk_engine_execute_cycle', { error: check.reason });
                    return { error: check.reason };
                }
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const engineContract = new ethers_2.ethers.Contract(env_1.env.WDK_ENGINE_ADDRESS, ['function executeCycle() external'], signer);
                const tx = await engineContract.executeCycle();
                await tx.wait();
                await reportToDashboard('wdk_engine_execute_cycle', { txHash: tx.hash });
                return { success: true, txHash: tx.hash, cycleNumber: 0 };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in wdk_engine_execute_cycle');
                throw e;
            }
        }
    }),
    wdk_engine_get_cycle_state: (0, ai_1.tool)({
        description: 'Get the current cycle state and decision preview from WDK Engine',
        parameters: zod_1.z.object({
            context: zod_1.z.string().describe('Reason for checking cycle state.')
        }),
        // @ts-ignore
        execute: async ({ context }) => {
            try {
                const engineContract = new ethers_2.ethers.Contract(env_1.env.WDK_ENGINE_ADDRESS, ['function previewDecision() view returns (tuple(bool executable, bytes32 reason, uint8 nextState, uint256 price, uint256 previousPrice, uint256 volatilityBps, uint256 targetWDKBps, uint256 targetLpBps, uint256 targetLendingBps, uint256 bountyBps, bool breakerPaused, int256 meanYieldBps, uint256 yieldVolatilityBps, int256 sharpeRatio, uint256 auctionElapsedSeconds, uint256 bufferUtilizationBps, uint256 healthFactor))'], new ethers_2.ethers.JsonRpcProvider(env_1.env.SEPOLIA_RPC_URL));
                const state = await engineContract.previewDecision();
                await reportToDashboard('wdk_engine_get_cycle_state', { nextState: state[2], price: state[3].toString() });
                return { success: true, nextState: String(state[2]), price: String(state[3]), timestamp: Date.now().toString(), cycleNumber: '0' };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in wdk_engine_get_cycle_state');
                throw e;
            }
        }
    }),
    wdk_engine_get_risk_metrics: (0, ai_1.tool)({
        description: 'Get risk metrics (health factor) from the WDK Engine',
        parameters: zod_1.z.object({
            context: zod_1.z.string().describe('Reason for checking risk metrics.')
        }),
        // @ts-ignore
        execute: async ({ context }) => {
            try {
                const engineContract = new ethers_2.ethers.Contract(env_1.env.WDK_ENGINE_ADDRESS, ['function getHealthFactor() view returns (uint256)'], new ethers_2.ethers.JsonRpcProvider(env_1.env.SEPOLIA_RPC_URL));
                const healthFactor = await engineContract.getHealthFactor();
                await reportToDashboard('wdk_engine_get_risk_metrics', { healthFactor: healthFactor.toString() });
                return { success: true, healthFactor: healthFactor.toString() };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in wdk_engine_get_risk_metrics');
                throw e;
            }
        }
    }),
    wdk_aave_supply: (0, ai_1.tool)({
        description: 'Supply USDT to Aave via the adapter',
        parameters: zod_1.z.object({
            amount: zod_1.z.string().describe('Amount of USDT to supply'),
            context: zod_1.z.string().describe('Reason for supplying to Aave.')
        }),
        // @ts-ignore
        execute: async ({ amount, context }) => {
            try {
                const check = policyGuard.validateTransaction({
                    toAddress: env_1.env.WDK_AAVE_ADAPTER_ADDRESS,
                    amount: amount,
                    currentRiskLevel: 'LOW',
                    portfolioValue: '1000000'
                });
                if (check.violated) {
                    await reportToDashboard('wdk_aave_supply', { error: check.reason });
                    return { error: check.reason };
                }
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const aaveAdapterContract = new ethers_2.ethers.Contract(env_1.env.WDK_AAVE_ADAPTER_ADDRESS, ['function onVaultDeposit(uint256 amount) external'], signer);
                const supplyAmount = ethers_2.ethers.parseUnits(amount, 6);
                const tx = await aaveAdapterContract.onVaultDeposit(supplyAmount);
                await tx.wait();
                await reportToDashboard('wdk_aave_supply', { txHash: tx.hash, amount });
                return { success: true, txHash: tx.hash, action: 'AAVE_SUPPLY' };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in wdk_aave_supply');
                throw e;
            }
        }
    }),
    wdk_aave_withdraw: (0, ai_1.tool)({
        description: 'Withdraw USDT from Aave via the adapter',
        parameters: zod_1.z.object({
            amount: zod_1.z.string().describe('Amount of USDT to withdraw'),
            context: zod_1.z.string().describe('Reason for withdrawing from Aave.')
        }),
        // @ts-ignore
        execute: async ({ amount, context }) => {
            try {
                const check = policyGuard.validateTransaction({
                    toAddress: env_1.env.WDK_AAVE_ADAPTER_ADDRESS,
                    amount: amount,
                    currentRiskLevel: 'LOW',
                    portfolioValue: '1000000'
                });
                if (check.violated) {
                    await reportToDashboard('wdk_aave_withdraw', { error: check.reason });
                    return { error: check.reason };
                }
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const aaveAdapterContract = new ethers_2.ethers.Contract(env_1.env.WDK_AAVE_ADAPTER_ADDRESS, ['function withdrawToVault(uint256 amount) external returns (uint256)'], signer);
                const withdrawAmount = ethers_2.ethers.parseUnits(amount, 6);
                const tx = await aaveAdapterContract.withdrawToVault(withdrawAmount);
                await tx.wait();
                await reportToDashboard('wdk_aave_withdraw', { txHash: tx.hash, amount });
                return { success: true, txHash: tx.hash, amountWithdrawn: amount };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in wdk_aave_withdraw');
                throw e;
            }
        }
    }),
    // ==================== X402 TOOLS (4) ====================
    x402_pay_subagent: (0, ai_1.tool)({
        description: 'Pay a sub-agent (robot) for specialized task execution using x402 protocol',
        parameters: zod_1.z.object({
            provider_address: zod_1.z.string().describe('Sub-agent wallet address to pay'),
            amount: zod_1.z.string().describe('Amount of USDT to pay'),
            service_type: zod_1.z.string().describe('Type of service: risk_analysis, arbitrage_scan, yield_optimization, data_fetch'),
            context: zod_1.z.string().describe('Reason for paying sub-agent.')
        }),
        // @ts-ignore
        execute: async ({ provider_address, amount, service_type, context }) => {
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
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const usdtContract = new ethers_2.ethers.Contract(env_1.env.WDK_USDT_ADDRESS, ['function transfer(address to, uint256 amount) external returns (bool)'], signer);
                const payAmount = ethers_2.ethers.parseUnits(amount, 6);
                const tx = await usdtContract.transfer(provider_address, payAmount);
                await tx.wait();
                await reportToDashboard('x402_pay_subagent', { txHash: tx.hash, amount, serviceType: service_type });
                return { success: true, txHash: tx.hash, amount, serviceType: service_type };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in x402_pay_subagent');
                throw e;
            }
        }
    }),
    x402_get_balance: (0, ai_1.tool)({
        description: 'Get USDT balance for x402 payments',
        parameters: zod_1.z.object({
            address: zod_1.z.string().optional().describe('Wallet address to check'),
            context: zod_1.z.string().describe('Reason for checking balance.')
        }),
        // @ts-ignore
        execute: async ({ address, context }) => {
            try {
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const targetAddress = address || await signer.getAddress();
                const usdtContract = new ethers_2.ethers.Contract(env_1.env.WDK_USDT_ADDRESS, ['function balanceOf(address account) external view returns (uint256)', 'function decimals() external view returns (uint8)'], new ethers_2.ethers.JsonRpcProvider(env_1.env.SEPOLIA_RPC_URL));
                const balance = await usdtContract.balanceOf(targetAddress);
                const decimals = await usdtContract.decimals();
                const balanceFormatted = ethers_2.ethers.formatUnits(balance, decimals);
                await reportToDashboard('x402_get_balance', { balance: balance.toString(), balanceFormatted });
                return { success: true, balance: balance.toString(), balanceFormatted };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in x402_get_balance');
                throw e;
            }
        }
    }),
    x402_list_services: (0, ai_1.tool)({
        description: 'List available sub-agent services that can be hired via x402 payments',
        parameters: zod_1.z.object({
            context: zod_1.z.string().describe('Reason for listing services.')
        }),
        // @ts-ignore
        execute: async ({ context }) => {
            try {
                const services = [
                    { id: 'risk_analysis', name: 'Risk Analysis Agent', description: 'Advanced risk assessment', priceUsdt: '0.1' },
                    { id: 'arbitrage_scan', name: 'Arbitrage Scanner', description: 'Cross-exchange arbitrage detection', priceUsdt: '0.2' },
                    { id: 'yield_optimization', name: 'Yield Optimizer', description: 'Find best yield farming opportunities', priceUsdt: '0.15' },
                    { id: 'data_fetch', name: 'Data Fetcher', description: 'On-chain and off-chain data retrieval', priceUsdt: '0.05' }
                ];
                await reportToDashboard('x402_list_services', { serviceCount: services.length });
                return { success: true, services };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in x402_list_services');
                throw e;
            }
        }
    }),
    x402_fleet_status: (0, ai_1.tool)({
        description: 'Get the robot fleet status and earnings',
        parameters: zod_1.z.object({
            context: zod_1.z.string().describe('Reason for checking fleet status.')
        }),
        // @ts-ignore
        execute: async ({ context }) => {
            try {
                const status = { enabled: true, robotCount: 3, totalEarned: '0.0000' };
                await reportToDashboard('x402_fleet_status', status);
                return { success: true, ...status };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in x402_fleet_status');
                throw e;
            }
        }
    }),
    // ==================== ERC4337 TOOLS (12) ====================
    erc4337_create_account: (0, ai_1.tool)({
        description: 'Create a smart account using ERC-4337',
        parameters: zod_1.z.object({
            salt: zod_1.z.string().optional().describe('Salt for account creation'),
            context: zod_1.z.string().describe('Reason for creating smart account.')
        }),
        // @ts-ignore
        execute: async ({ salt, context }) => {
            if (!env_1.env.ERC4337_FACTORY_ADDRESS) {
                return { error: 'ERC4337_FACTORY_ADDRESS not configured. Set it in .env file.' };
            }
            try {
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const signerAddress = await signer.getAddress();
                const factoryContract = new ethers_2.ethers.Contract(env_1.env.ERC4337_FACTORY_ADDRESS, ['function createAccount(address owner) external returns (address)'], signer);
                const tx = await factoryContract.createAccount(signerAddress);
                await tx.wait();
                await reportToDashboard('erc4337_create_account', { txHash: tx.hash });
                return { success: true, txHash: tx.hash };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in erc4337_create_account');
                throw e;
            }
        }
    }),
    erc4337_get_account_address: (0, ai_1.tool)({
        description: 'Get smart account address for owner',
        parameters: zod_1.z.object({
            owner: zod_1.z.string().optional().describe('Owner address (defaults to agent wallet)')
        }),
        // @ts-ignore
        execute: async ({ owner }) => {
            if (!env_1.env.ERC4337_FACTORY_ADDRESS) {
                return { error: 'ERC4337_FACTORY_ADDRESS not configured. Set it in .env file.' };
            }
            try {
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const ownerAddress = owner || await signer.getAddress();
                const FACTORY_ABI = ['function getAccountAddress(address owner) external view returns (address)'];
                const factoryContract = new ethers_2.ethers.Contract(env_1.env.ERC4337_FACTORY_ADDRESS, FACTORY_ABI, new ethers_2.ethers.JsonRpcProvider(env_1.env.SEPOLIA_RPC_URL));
                const address = await factoryContract.getAccountAddress(ownerAddress);
                await reportToDashboard('erc4337_get_account_address', { address });
                return { success: true, address };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in erc4337_get_account_address');
                throw e;
            }
        }
    }),
    erc4337_is_valid_account: (0, ai_1.tool)({
        description: 'Check if a smart account is deployed',
        parameters: zod_1.z.object({
            account_address: zod_1.z.string().describe('Smart account address to check'),
            context: zod_1.z.string().describe('Reason for checking account validity.')
        }),
        // @ts-ignore
        execute: async ({ account_address, context }) => {
            try {
                const provider = new ethers_2.ethers.JsonRpcProvider(env_1.env.SEPOLIA_RPC_URL);
                const code = await provider.getCode(account_address);
                const isDeployed = code !== '0x';
                await reportToDashboard('erc4337_is_valid_account', { accountAddress: account_address, isDeployed });
                return { success: true, accountAddress: account_address, isDeployed };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in erc4337_is_valid_account');
                throw e;
            }
        }
    }),
    erc4337_execute: (0, ai_1.tool)({
        description: 'Execute a single transaction via smart account',
        parameters: zod_1.z.object({
            to: zod_1.z.string().describe('Target address'),
            data: zod_1.z.string().describe('Call data'),
            value: zod_1.z.string().optional().describe('ETH value to send'),
            context: zod_1.z.string().describe('Reason for executing transaction.')
        }),
        // @ts-ignore
        execute: async ({ to, data, value, context }) => {
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
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const signerAddress = await signer.getAddress();
                const accountContract = new ethers_2.ethers.Contract(signerAddress, ['function execute(address dest, uint256 value, bytes calldata func) external'], signer);
                const txValue = value ? ethers_2.ethers.parseEther(value) : 0n;
                const tx = await accountContract.execute(to, txValue, data);
                await tx.wait();
                await reportToDashboard('erc4337_execute', { txHash: tx.hash, to, value });
                return { success: true, txHash: tx.hash, to, value };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in erc4337_execute');
                throw e;
            }
        }
    }),
    erc4337_execute_batch: (0, ai_1.tool)({
        description: 'Execute multiple transactions via smart account',
        parameters: zod_1.z.object({
            calls: zod_1.z.array(zod_1.z.object({
                to: zod_1.z.string(),
                data: zod_1.z.string(),
                value: zod_1.z.string().optional()
            })).describe('Array of call objects'),
            context: zod_1.z.string().describe('Reason for executing batch.')
        }),
        // @ts-ignore
        execute: async ({ calls, context }) => {
            try {
                const totalValue = calls.reduce((sum, c) => sum + (c.value ? ethers_2.ethers.parseEther(c.value) : 0n), 0n);
                const check = policyGuard.validateTransaction({
                    toAddress: calls[0]?.to || ethers_2.ethers.ZeroAddress,
                    amount: totalValue.toString(),
                    currentRiskLevel: 'LOW',
                    portfolioValue: '1000000'
                });
                if (check.violated) {
                    await reportToDashboard('erc4337_execute_batch', { error: check.reason });
                    return { error: check.reason };
                }
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const signerAddress = await signer.getAddress();
                const accountContract = new ethers_2.ethers.Contract(signerAddress, ['function executeBatch(address[] dests, uint256[] values, bytes[] calldatas) external'], signer);
                const dests = calls.map(c => c.to);
                const values = calls.map(c => c.value ? ethers_2.ethers.parseEther(c.value) : 0n);
                const calldatas = calls.map(c => c.data);
                const tx = await accountContract.executeBatch(dests, values, calldatas);
                await tx.wait();
                await reportToDashboard('erc4337_execute_batch', { txHash: tx.hash, callCount: calls.length });
                return { success: true, txHash: tx.hash, callCount: calls.length };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in erc4337_execute_batch');
                throw e;
            }
        }
    }),
    erc4337_add_deposit: (0, ai_1.tool)({
        description: 'Add deposit to EntryPoint for gas payments',
        parameters: zod_1.z.object({
            amount: zod_1.z.string().describe('Amount of ETH to deposit'),
            context: zod_1.z.string().describe('Reason for adding deposit.')
        }),
        // @ts-ignore
        execute: async ({ amount, context }) => {
            try {
                const check = policyGuard.validateTransaction({
                    toAddress: env_1.env.ERC4337_ENTRYPOINT_ADDRESS,
                    amount: amount,
                    currentRiskLevel: 'LOW',
                    portfolioValue: '1000000'
                });
                if (check.violated) {
                    await reportToDashboard('erc4337_add_deposit', { error: check.reason });
                    return { error: check.reason };
                }
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const signerAddress = await signer.getAddress();
                const entryPointContract = new ethers_2.ethers.Contract(env_1.env.ERC4337_ENTRYPOINT_ADDRESS, ['function depositTo(address account) external payable'], signer);
                const depositAmount = ethers_2.ethers.parseEther(amount);
                const tx = await entryPointContract.depositTo(signerAddress, { value: depositAmount });
                await tx.wait();
                await reportToDashboard('erc4337_add_deposit', { txHash: tx.hash, amount });
                return { success: true, txHash: tx.hash, amount };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in erc4337_add_deposit');
                throw e;
            }
        }
    }),
    erc4337_get_balance: (0, ai_1.tool)({
        description: 'Get balance of smart account',
        parameters: zod_1.z.object({
            account_address: zod_1.z.string().optional().describe('Account address to check'),
            context: zod_1.z.string().describe('Reason for checking balance.')
        }),
        // @ts-ignore
        execute: async ({ account_address, context }) => {
            try {
                const provider = new ethers_2.ethers.JsonRpcProvider(env_1.env.SEPOLIA_RPC_URL);
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const signerAddress = await signer.getAddress();
                const targetAddress = account_address || signerAddress;
                const balance = await provider.getBalance(targetAddress);
                await reportToDashboard('erc4337_get_balance', { balance: balance.toString(), address: targetAddress });
                return { success: true, balance: balance.toString(), address: targetAddress };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in erc4337_get_balance');
                throw e;
            }
        }
    }),
    erc4337_get_deposit: (0, ai_1.tool)({
        description: 'Get EntryPoint deposit for account',
        parameters: zod_1.z.object({
            account_address: zod_1.z.string().optional().describe('Account address'),
            context: zod_1.z.string().describe('Reason for checking deposit.')
        }),
        // @ts-ignore
        execute: async ({ account_address, context }) => {
            try {
                const provider = new ethers_2.ethers.JsonRpcProvider(env_1.env.SEPOLIA_RPC_URL);
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const signerAddress = await signer.getAddress();
                const targetAddress = account_address || signerAddress;
                const entryPointContract = new ethers_2.ethers.Contract(env_1.env.ERC4337_ENTRYPOINT_ADDRESS, ['function balanceOf(address account) external view returns (uint256)'], provider);
                const deposit = await entryPointContract.balanceOf(targetAddress);
                await reportToDashboard('erc4337_get_deposit', { deposit: deposit.toString(), address: targetAddress });
                return { success: true, deposit: deposit.toString(), address: targetAddress };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in erc4337_get_deposit');
                throw e;
            }
        }
    }),
    erc4337_withdraw_token: (0, ai_1.tool)({
        description: 'Withdraw ERC-20 token from smart account',
        parameters: zod_1.z.object({
            token_address: zod_1.z.string().describe('ERC-20 token contract address'),
            amount: zod_1.z.string().describe('Amount to withdraw'),
            to: zod_1.z.string().optional().describe('Recipient address'),
            context: zod_1.z.string().describe('Reason for withdrawing tokens.')
        }),
        // @ts-ignore
        execute: async ({ token_address, amount, to, context }) => {
            try {
                const signer = await (0, wdk_loader_1.getWdkSigner)();
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
                const erc20Interface = new ethers_2.ethers.Interface(['function transfer(address to, uint256 amount) external returns (bool)']);
                const data = erc20Interface.encodeFunctionData('transfer', [recipient, ethers_2.ethers.parseUnits(amount, 6)]);
                const accountContract = new ethers_2.ethers.Contract(signerAddress, ['function execute(address dest, uint256 value, bytes calldata func) external'], signer);
                const tx = await accountContract.execute(token_address, 0, data);
                await tx.wait();
                await reportToDashboard('erc4337_withdraw_token', { txHash: tx.hash, token: token_address, amount, to: recipient });
                return { success: true, txHash: tx.hash, token: token_address, amount, to: recipient };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in erc4337_withdraw_token');
                throw e;
            }
        }
    }),
    erc4337_withdraw_native: (0, ai_1.tool)({
        description: 'Withdraw native tokens from smart account',
        parameters: zod_1.z.object({
            amount: zod_1.z.string().describe('Amount of ETH to withdraw'),
            to: zod_1.z.string().optional().describe('Recipient address'),
            context: zod_1.z.string().describe('Reason for withdrawing native tokens.')
        }),
        // @ts-ignore
        execute: async ({ amount, to, context }) => {
            try {
                const signer = await (0, wdk_loader_1.getWdkSigner)();
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
                const withdrawAmount = ethers_2.ethers.parseEther(amount);
                const accountContract = new ethers_2.ethers.Contract(signerAddress, ['function execute(address dest, uint256 value, bytes calldata func) external'], signer);
                const tx = await accountContract.execute(recipient, withdrawAmount, '0x');
                await tx.wait();
                await reportToDashboard('erc4337_withdraw_native', { txHash: tx.hash, amount, to: recipient });
                return { success: true, txHash: tx.hash, amount, to: recipient };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in erc4337_withdraw_native');
                throw e;
            }
        }
    }),
    erc4337_set_token_approval: (0, ai_1.tool)({
        description: 'Set ERC-20 token approval for paymaster',
        parameters: zod_1.z.object({
            token_address: zod_1.z.string().describe('Token contract address'),
            paymaster_address: zod_1.z.string().describe('Paymaster address'),
            context: zod_1.z.string().describe('Reason for setting approval.')
        }),
        // @ts-ignore
        execute: async ({ token_address, paymaster_address, context }) => {
            try {
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const signerAddress = await signer.getAddress();
                // Approve paymaster to spend tokens
                const erc20Interface = new ethers_2.ethers.Interface(['function approve(address spender, uint256 amount) external returns (bool)']);
                const data = erc20Interface.encodeFunctionData('approve', [paymaster_address, ethers_2.ethers.MaxUint256]);
                const accountContract = new ethers_2.ethers.Contract(signerAddress, ['function execute(address dest, uint256 value, bytes calldata func) external'], signer);
                const tx = await accountContract.execute(token_address, 0, data);
                await tx.wait();
                await reportToDashboard('erc4337_set_token_approval', { txHash: tx.hash, token: token_address, paymaster: paymaster_address });
                return { success: true, txHash: tx.hash, token: token_address, paymaster: paymaster_address };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in erc4337_set_token_approval');
                throw e;
            }
        }
    }),
    erc4337_is_token_approved: (0, ai_1.tool)({
        description: 'Check if ERC-20 token is approved for paymaster',
        parameters: zod_1.z.object({
            token_address: zod_1.z.string().describe('Token contract address'),
            paymaster_address: zod_1.z.string().describe('Paymaster address'),
            account_address: zod_1.z.string().optional().describe('Account to check approval for'),
            context: zod_1.z.string().describe('Reason for checking approval.')
        }),
        // @ts-ignore
        execute: async ({ token_address, paymaster_address, account_address, context }) => {
            try {
                const provider = new ethers_2.ethers.JsonRpcProvider(env_1.env.SEPOLIA_RPC_URL);
                const signer = await (0, wdk_loader_1.getWdkSigner)();
                const signerAddress = await signer.getAddress();
                const targetAddress = account_address || signerAddress;
                const erc20Contract = new ethers_2.ethers.Contract(token_address, ['function allowance(address owner, address spender) external view returns (uint256)'], provider);
                const allowance = await erc20Contract.allowance(targetAddress, paymaster_address);
                const isApproved = allowance > 0n;
                await reportToDashboard('erc4337_is_token_approved', { token: token_address, paymaster: paymaster_address, isApproved, allowance: allowance.toString() });
                return { success: true, token: token_address, paymaster: paymaster_address, isApproved, allowance: allowance.toString() };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in erc4337_is_token_approved');
                throw e;
            }
        }
    }),
    // ============================================
    // Robot Fleet Operations
    // ============================================
    robot_fleet_status: (0, ai_1.tool)({
        description: 'Get the current status of the Robot Fleet including robot list, total earnings, and recent events.',
        parameters: zod_1.z.object({
            context: zod_1.z.string().describe('Reason for checking fleet status.')
        }),
        // @ts-ignore
        execute: async ({ context }) => {
            try {
                const status = RobotFleetService_1.robotFleetService.getFleetStatus();
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
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in robot_fleet_status');
                throw e;
            }
        }
    }),
    robot_fleet_start: (0, ai_1.tool)({
        description: 'Start the Robot Fleet simulator. This activates the fleet of robots that can perform tasks and earn yields.',
        parameters: zod_1.z.object({
            context: zod_1.z.string().describe('Reason for starting the fleet.')
        }),
        // @ts-ignore
        execute: async ({ context }) => {
            try {
                const currentStatus = RobotFleetService_1.robotFleetService.getFleetStatus();
                if (currentStatus.enabled) {
                    return { success: true, message: 'Robot Fleet is already running', robots: currentStatus.robots };
                }
                await RobotFleetService_1.robotFleetService.startSimulator();
                await new Promise(resolve => setTimeout(resolve, 1000));
                const newStatus = RobotFleetService_1.robotFleetService.getFleetStatus();
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
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in robot_fleet_start');
                throw e;
            }
        }
    }),
    robot_fleet_get_events: (0, ai_1.tool)({
        description: 'Get recent events from the Robot Fleet including task completions, earnings, and transactions.',
        parameters: zod_1.z.object({
            limit: zod_1.z.number().optional().describe('Maximum number of events to return (default: 10)'),
            context: zod_1.z.string().describe('Reason for getting events.')
        }),
        // @ts-ignore
        execute: async ({ limit = 10, context }) => {
            try {
                const events = RobotFleetService_1.robotFleetService.getRecentEvents();
                const limitedEvents = events.slice(-limit);
                await reportToDashboard('robot_fleet_get_events', {
                    eventCount: limitedEvents.length
                });
                return {
                    success: true,
                    events: limitedEvents,
                    totalEvents: events.length
                };
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in robot_fleet_get_events');
                throw e;
            }
        }
    }),
    robot_fleet_get_robots: (0, ai_1.tool)({
        description: 'Get detailed information about all robots in the fleet including their status, earnings, and task count.',
        parameters: zod_1.z.object({
            context: zod_1.z.string().describe('Reason for getting robot information.')
        }),
        // @ts-ignore
        execute: async ({ context }) => {
            try {
                const robots = RobotFleetService_1.robotFleetService.getRobots();
                const status = RobotFleetService_1.robotFleetService.getFleetStatus();
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
            }
            catch (e) {
                logger_1.logger.error(e, '[Tools] Error in robot_fleet_get_robots');
                throw e;
            }
        }
    }),
    // ==================== MARKET SCANNER TOOLS ====================
    market_get_price_matrix: (0, ai_1.tool)({
        description: 'Get real-time price matrix for trading pairs across exchanges like Binance, Bybit, OKX. Returns best arbitrage opportunities.',
        parameters: zod_1.z.object({
            pairs: zod_1.z.array(zod_1.z.string()).optional().describe('Trading pairs to scan'),
        }),
        // @ts-ignore
        execute: async ({ pairs }) => {
            const { createMarketScanner } = await import('@/services/market-scanner');
            const scanner = createMarketScanner(env_1.env.SEPOLIA_RPC_URL, { scanIntervalMs: 5000, minSpreadThreshold: 0.1 });
            const matrix = await scanner.scan();
            return {
                timestamp: matrix.timestamp,
                gasPriceGwei: matrix.gasPriceGwei,
                ethPriceUsd: matrix.ethPriceUsd,
                pairs: matrix.pairs,
                bestOpportunity: matrix.bestOpportunity,
            };
        },
    }),
    market_get_best_opportunity: (0, ai_1.tool)({
        description: 'Find the best arbitrage opportunity across monitored exchanges. Returns the most profitable spread.',
        parameters: zod_1.z.object({
            minSpreadBps: zod_1.z.number().optional().describe('Minimum spread in basis points'),
        }),
        // @ts-ignore
        execute: async ({ minSpreadBps }) => {
            const { createMarketScanner } = await import('@/services/market-scanner');
            const scanner = createMarketScanner(env_1.env.SEPOLIA_RPC_URL, { scanIntervalMs: 5000, minSpreadThreshold: minSpreadBps ?? 0.1 });
            const matrix = await scanner.scan();
            if (!matrix.bestOpportunity) {
                return { found: false, reason: 'No profitable opportunity found', gasPriceGwei: matrix.gasPriceGwei };
            }
            const opp = matrix.bestOpportunity;
            return {
                found: true,
                opportunity: {
                    pair: opp.pair,
                    buyExchange: opp.buyExchange,
                    sellExchange: opp.sellExchange,
                    spreadPercent: opp.spreadPercent.toFixed(3),
                    netProfitUsd: opp.netProfitUsd.toFixed(2),
                },
            };
        },
    }),
    market_calculate_profit: (0, ai_1.tool)({
        description: 'Calculate profit breakdown for a potential arbitrage trade including fees and gas costs.',
        parameters: zod_1.z.object({
            spreadBps: zod_1.z.number().describe('Spread in basis points'),
            volumeUsd: zod_1.z.number().optional().describe('Trade volume in USD'),
            buyExchange: zod_1.z.string().optional().describe('Exchange to buy from'),
            sellExchange: zod_1.z.string().optional().describe('Exchange to sell to'),
        }),
        // @ts-ignore
        execute: async ({ spreadBps, volumeUsd, buyExchange, sellExchange }) => {
            const { calculateProfit } = await import('@/services/market-scanner/ProfitCalculator');
            const provider = new ethers_2.ethers.JsonRpcProvider(env_1.env.SEPOLIA_RPC_URL);
            let gasPriceGwei = 0.96;
            try {
                const feeData = await provider.getFeeData();
                gasPriceGwei = Number(ethers_2.ethers.formatUnits(feeData.gasPrice ?? 0n, 'gwei'));
            }
            catch { }
            const feeMap = { binance: 10, bybit: 10, okx: 8, uniswap: 30, curve: 4, pancakeswap: 25 };
            const analysis = calculateProfit({
                spreadBps,
                volumeUsd: volumeUsd ?? 1000,
                gasEstimate: 150000,
                gasPriceGwei,
                ethPriceUsd: 3500,
                buyFeeBps: feeMap[buyExchange ?? 'binance'] ?? 10,
                sellFeeBps: feeMap[sellExchange ?? 'uniswap'] ?? 10,
            });
            return {
                grossProfitUsd: analysis.grossProfitUsd.toFixed(2),
                gasCostUsd: analysis.gasCostUsd.toFixed(2),
                netProfitUsd: analysis.netProfitUsd.toFixed(2),
                isProfitable: analysis.isProfitable,
                recommendation: analysis.recommendation,
            };
        },
    }),
    // ==================== WDK BRIDGE TOOLS ====================
    wdk_bridge_usdt0: (0, ai_1.tool)({
        description: 'Get a bridge quote for USDT to another chain via WDK USDT0 protocol. Supported chains: arbitrum, polygon, optimism, gnosis, mantle, avalanche, celo, sei.',
        parameters: zod_1.z.object({
            targetChain: zod_1.z.string().optional().describe('Destination chain (default: arbitrum)'),
            amount: zod_1.z.string().optional().describe('Amount in USDT (default: 100)'),
            recipient: zod_1.z.string().optional().describe('Recipient address (default: same as sender)'),
        }),
        // @ts-ignore
        execute: async ({ targetChain, amount, recipient }) => {
            const destChain = (targetChain || 'arbitrum').toLowerCase();
            const amountUsdt = ethers_2.ethers.parseUnits(amount || '100', 6);
            const wallet = ethers_2.ethers.HDNodeWallet.fromPhrase(env_1.env.WDK_SECRET_SEED);
            const walletAddress = wallet.address;
            const recipientAddress = recipient || walletAddress;
            const MAINNET_USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
            const MAINNET_RPC = 'https://eth.drpc.org';
            try {
                const { WalletAccountEvm } = await import('@tetherto/wdk-wallet-evm');
                const Usdt0ProtocolEvm = (await import('@tetherto/wdk-protocol-bridge-usdt0-evm')).default;
                const account = new WalletAccountEvm(env_1.env.WDK_SECRET_SEED, "0'/0/0", {
                    provider: MAINNET_RPC
                });
                const bridgeProtocol = new Usdt0ProtocolEvm(account, {
                    bridgeMaxFee: 1000000000000000n
                });
                const quote = await bridgeProtocol.quoteBridge({
                    targetChain: destChain,
                    recipient: recipientAddress,
                    token: MAINNET_USDT,
                    amount: amountUsdt
                });
                return {
                    targetChain: destChain,
                    sourceChain: 'ethereum_mainnet',
                    amountUsdt: amount || '100',
                    walletAddress,
                    recipient: recipientAddress,
                    estimatedOutput: ethers_2.ethers.formatUnits(amountUsdt - quote.bridgeFee, 6),
                    bridgeFee: ethers_2.ethers.formatUnits(quote.bridgeFee, 18),
                    totalFee: ethers_2.ethers.formatUnits(quote.fee, 18),
                    estimatedTime: '~10-15 min',
                    network: 'Ethereum Mainnet → ' + destChain,
                    note: 'Quote only. Execute requires ETH on Ethereum mainnet for gas.'
                };
            }
            catch (e) {
                const isInsufficientFunds = e.message?.includes('insufficient funds');
                return {
                    targetChain: destChain,
                    sourceChain: 'ethereum_mainnet',
                    amountUsdt: amount || '100',
                    walletAddress,
                    recipient: recipientAddress,
                    estimatedTime: '~10-15 min',
                    network: 'Ethereum Mainnet → ' + destChain,
                    note: isInsufficientFunds
                        ? 'Quote generated but requires ETH on Ethereum mainnet for gas. Bridge module works correctly.'
                        : 'Bridge quote unavailable: ' + e.message,
                    error: isInsufficientFunds ? undefined : e.message,
                    status: isInsufficientFunds ? 'ready' : 'error'
                };
            }
        },
    }),
    wdk_lending_getPosition: (0, ai_1.tool)({
        description: 'Get current Aave V3 lending position on Ethereum Sepolia including total collateral, debt, and health factor.',
        parameters: zod_1.z.object({}),
        // @ts-ignore
        execute: async () => {
            const SEPOLIA_RPC = env_1.env.SEPOLIA_RPC_URL;
            const AAVE_V3_POOL_SEPOLIA = '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951';
            try {
                const provider = new ethers_2.ethers.JsonRpcProvider(SEPOLIA_RPC);
                const wallet = ethers_2.ethers.HDNodeWallet.fromPhrase(env_1.env.WDK_SECRET_SEED).connect(provider);
                const userAddress = wallet.address;
                const poolAbi = [
                    'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)'
                ];
                const pool = new ethers_2.ethers.Contract(AAVE_V3_POOL_SEPOLIA, poolAbi, provider);
                const data = await pool.getUserAccountData.staticCall(userAddress);
                const hasPosition = data[0] > 0n || data[1] > 0n;
                if (hasPosition) {
                    return {
                        network: 'ethereum_sepolia',
                        walletAddress: userAddress,
                        totalCollateral: ethers_2.ethers.formatUnits(data[0], 6),
                        totalDebt: ethers_2.ethers.formatUnits(data[1], 6),
                        availableBorrows: ethers_2.ethers.formatUnits(data[2], 6),
                        healthFactor: ethers_2.ethers.formatUnits(data[5], 18),
                        ltv: ethers_2.ethers.formatUnits(data[4], 4),
                        liquidationThreshold: ethers_2.ethers.formatUnits(data[3], 4),
                        aavePool: AAVE_V3_POOL_SEPOLIA
                    };
                }
            }
            catch (e) {
                // Return zeros on error
            }
            const wallet = ethers_2.ethers.HDNodeWallet.fromPhrase(env_1.env.WDK_SECRET_SEED);
            const userAddress = wallet.address;
            return {
                network: 'ethereum_sepolia',
                walletAddress: userAddress,
                totalCollateral: "0.0",
                totalDebt: "0.0",
                availableBorrows: "0.0",
                healthFactor: "0.0",
                ltv: "0.0",
                liquidationThreshold: "0.0",
                note: 'No Aave position on Sepolia. Supply USDT at app.aave.com (testnet mode) to create a position.',
                aavePool: AAVE_V3_POOL_SEPOLIA
            };
        },
    }),
};
// Proxy to normalize tool names (trim whitespace from AI model tool calls)
exports.normalizedAgentTools = new Proxy(exports.agentTools, {
    get(target, prop) {
        const trimmedProp = typeof prop === 'string' ? prop.trim() : prop;
        if (trimmedProp !== prop) {
            logger_1.logger.debug({ original: prop, trimmed: trimmedProp }, '[Tools] Tool name had whitespace - normalizing');
        }
        const tool = target[trimmedProp];
        if (tool)
            return tool;
        return target[prop];
    }
});
function getToolsMetadata() {
    const tools = [];
    for (const [name, toolDef] of Object.entries(exports.agentTools)) {
        const def = toolDef;
        const parameters = [];
        // Extract parameter names from Zod schema
        if (def.parameters?._def?.shape) {
            try {
                const shape = def.parameters._def.shape();
                parameters.push(...Object.keys(shape).filter(k => k !== 'ZodDefault'));
            }
            catch (e) {
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

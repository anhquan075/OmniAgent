"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfitSimulator = void 0;
exports.createProfitSimulator = createProfitSimulator;
const ethers_1 = require("ethers");
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../../utils/logger");
class ProfitSimulator {
    rpcUrl;
    gasPrice = 0n;
    lastGasPriceUpdate = new Date();
    gasTokenPrice = 0; // BNB price in USD
    constructor(rpcUrl) {
        this.rpcUrl = rpcUrl;
    }
    /**
     * Fetch current gas price from RPC
     */
    async fetchGasPrice() {
        const timeSinceUpdate = Date.now() - this.lastGasPriceUpdate.getTime();
        // Cache gas price for 30 seconds
        if (timeSinceUpdate < 30000 && this.gasPrice > 0n) {
            return this.gasPrice;
        }
        try {
            const provider = new ethers_1.ethers.JsonRpcProvider(this.rpcUrl);
            const feeData = await provider.getFeeData();
            if (feeData.gasPrice) {
                this.gasPrice = feeData.gasPrice;
                this.lastGasPriceUpdate = new Date();
                return this.gasPrice;
            }
        }
        catch (e) {
            logger_1.logger.error(e, '[ProfitSimulator] Failed to fetch gas price');
        }
        return this.gasPrice || ethers_1.ethers.parseUnits('5', 'gwei');
    }
    /**
     * Fetch BNB/USD price
     */
    async fetchGasTokenPrice() {
        try {
            const response = await axios_1.default.get('https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd', { timeout: 5000 });
            const price = response.data?.binancecoin?.usd || 0;
            if (price > 0) {
                this.gasTokenPrice = price;
            }
            return this.gasTokenPrice;
        }
        catch (e) {
            logger_1.logger.error(e, '[ProfitSimulator] Failed to fetch BNB price');
            return this.gasTokenPrice || 600; // Fallback estimate
        }
    }
    /**
     * Estimate gas for a swap transaction
     * Conservative estimate: assumes ~200k gas for typical swap
     */
    async estimateSwapGas(params) {
        const gasPrice = await this.fetchGasPrice();
        const bnbPrice = await this.fetchGasTokenPrice();
        // Conservative estimates:
        // - Simple swap: 150k-200k gas
        // - Complex route: 250k-350k gas
        const estimatedGas = 200000n;
        const gasCostBN = estimatedGas * gasPrice;
        const gasCostETH = ethers_1.ethers.formatEther(gasCostBN);
        const gasCostUSDT = parseFloat(gasCostETH) * bnbPrice;
        return {
            gasUsed: estimatedGas.toString(),
            gasPrice: gasPrice.toString(),
            totalGasCost: ethers_1.ethers.parseUnits(gasCostUSDT.toFixed(6), 6).toString(),
            estimatedFee: ethers_1.ethers.parseUnits(gasCostUSDT.toFixed(2), 6).toString(),
        };
    }
    /**
     * Estimate gas for a bridge transaction
     * Bridges are more expensive: 300k-500k gas
     */
    async estimateBridgeGas(params) {
        const gasPrice = await this.fetchGasPrice();
        const bnbPrice = await this.fetchGasTokenPrice();
        // Bridge operations are expensive
        const estimatedGas = 350000n;
        const gasCostBN = estimatedGas * gasPrice;
        const gasCostETH = ethers_1.ethers.formatEther(gasCostBN);
        const gasCostUSDT = parseFloat(gasCostETH) * bnbPrice;
        return {
            gasUsed: estimatedGas.toString(),
            gasPrice: gasPrice.toString(),
            totalGasCost: ethers_1.ethers.parseUnits(gasCostUSDT.toFixed(6), 6).toString(),
            estimatedFee: ethers_1.ethers.parseUnits(gasCostUSDT.toFixed(2), 6).toString(),
        };
    }
    /**
     * Calculate projected yield for a position
     */
    calculateYieldProjection(params) {
        const principal = BigInt(params.principalAmount);
        const apy = BigInt(Math.floor(params.apy * 100)); // Convert to basis points
        let yieldAmount = 0n;
        let description = params.timeframe;
        switch (params.timeframe) {
            case 'daily':
                yieldAmount = (principal * apy) / (365n * 10000n);
                break;
            case 'weekly':
                yieldAmount = (principal * apy) / (52n * 10000n);
                break;
            case 'monthly':
                yieldAmount = (principal * apy) / (12n * 10000n);
                break;
            case 'yearly':
                yieldAmount = (principal * apy) / 10000n;
                break;
        }
        const yieldPercentage = (params.apy * 100) / 100; // Already in percentage
        return {
            principalAmount: params.principalAmount,
            projectedYield: yieldAmount.toString(),
            yieldPercentage,
            timeframe: params.timeframe,
        };
    }
    /**
     * Simulate a swap profitability
     */
    async simulateSwap(params) {
        const gasEstimate = await this.estimateSwapGas({
            fromToken: params.inputToken,
            toToken: params.outputToken,
            amount: params.inputAmount,
        });
        const inputBN = BigInt(params.inputAmount);
        const outputBN = BigInt(params.expectedOutput);
        const gasCostBN = BigInt(gasEstimate.totalGasCost);
        // Net profit = output - input - gas
        const netProfit = outputBN - inputBN - gasCostBN;
        const profitMargin = inputBN > 0n ? (Number(netProfit) / Number(inputBN)) * 100 : 0;
        return {
            action: 'SWAP',
            inputAmount: params.inputAmount,
            estimatedOutput: params.expectedOutput,
            gasEstimate,
            netProfit: netProfit.toString(),
            profitMargin,
            yieldProjection: {
                principalAmount: params.inputAmount,
                projectedYield: '0',
                yieldPercentage: 0,
                timeframe: 'daily',
            },
            isViable: netProfit > 0n,
        };
    }
    /**
     * Simulate a bridge operation profitability
     */
    async simulateBridge(params) {
        const gasEstimate = await this.estimateBridgeGas({
            fromChain: params.fromChain,
            toChain: params.toChain,
            amount: params.inputAmount,
        });
        const inputBN = BigInt(params.inputAmount);
        const gasCostBN = BigInt(gasEstimate.totalGasCost);
        const principal = Number(ethers_1.ethers.formatUnits(inputBN, 6));
        const yieldDiffBps = Math.floor(params.expectedYieldDifference * 100);
        const yieldDiffDaily = (principal * yieldDiffBps) / 365 / 10000;
        const totalExtraYield = yieldDiffDaily * params.holdingPeriodDays;
        const extraYieldBN = BigInt(Math.round(totalExtraYield * 1e6));
        // Net profit = extra yield - gas cost
        const netProfit = extraYieldBN - gasCostBN;
        const profitMargin = inputBN > 0n ? (Number(netProfit) / Number(inputBN)) * 100 : 0;
        return {
            action: 'BRIDGE',
            inputAmount: params.inputAmount,
            estimatedOutput: inputBN.toString(), // Same amount, different chain
            gasEstimate,
            netProfit: netProfit.toString(),
            profitMargin,
            yieldProjection: this.calculateYieldProjection({
                principalAmount: params.inputAmount,
                apy: params.expectedYieldDifference,
                timeframe: 'daily',
            }),
            isViable: netProfit > 0n,
        };
    }
    /**
     * Simulate a rebalance operation
     */
    async simulateRebalance(params) {
        const numSwaps = Object.keys(params.currentAllocation).length;
        const totalGasCost = BigInt(params.estimatedGasPerSwap) * BigInt(numSwaps);
        const portfolioValueBN = BigInt(params.portfolioValue);
        // Rebalancing has minimal immediate profit but reduces risk
        const netProfit = -totalGasCost; // Just the gas cost
        const profitMargin = (Number(netProfit) / Number(portfolioValueBN)) * 100;
        return {
            action: 'REBALANCE',
            inputAmount: params.portfolioValue,
            estimatedOutput: (portfolioValueBN + netProfit).toString(),
            gasEstimate: {
                gasUsed: (BigInt(200000) * BigInt(numSwaps)).toString(),
                gasPrice: '5000000000', // 5 gwei placeholder
                totalGasCost: totalGasCost.toString(),
                estimatedFee: totalGasCost.toString(),
            },
            netProfit: netProfit.toString(),
            profitMargin,
            yieldProjection: {
                principalAmount: params.portfolioValue,
                projectedYield: '0',
                yieldPercentage: 0,
                timeframe: 'daily',
            },
            isViable: true, // Rebalancing is always "viable" for risk management
        };
    }
}
exports.ProfitSimulator = ProfitSimulator;
function createProfitSimulator(rpcUrl) {
    return new ProfitSimulator(rpcUrl);
}

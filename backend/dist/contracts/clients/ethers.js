"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContracts = exports.provider = void 0;
exports.getSigner = getSigner;
const ethers_1 = require("ethers");
const env_1 = require("../../config/env");
const logger_1 = require("../../utils/logger");
const wdk_loader_1 = require("../../lib/wdk-loader");
// Load ABIs
const abis_1 = require("../abis");
logger_1.logger.info({ rpcUrl: env_1.env.SEPOLIA_RPC_URL }, '[Ethers] Initializing provider');
exports.provider = new ethers_1.ethers.JsonRpcProvider(env_1.env.SEPOLIA_RPC_URL);
let signerPromise = null;
async function getSigner() {
    if (!signerPromise) {
        signerPromise = (async () => {
            if (env_1.env.PRIVATE_KEY) {
                return new ethers_1.ethers.Wallet(env_1.env.PRIVATE_KEY, exports.provider);
            }
            return (0, wdk_loader_1.getWdkSigner)(env_1.env.SEPOLIA_RPC_URL);
        })();
    }
    return signerPromise;
}
const getContracts = () => {
    const engineAbi = abis_1.StrategyEngineAbi;
    const breakerAbiActual = abis_1.CircuitBreakerAbi;
    const vaultAbiActual = abis_1.OmniAgentVaultAbi;
    const oracleAbiActual = abis_1.ZKRiskOracleAbi;
    const auctionAbiActual = abis_1.ExecutionAuctionAbi;
    const syndicateAbiActual = abis_1.GroupSyndicateAbi;
    const USDT_ABI = [
        "function balanceOf(address) view returns (uint256)",
        "function allowance(address,address) view returns (uint256)",
        "function approve(address,uint256) returns (bool)",
        "function decimals() view returns (uint8)"
    ];
    return {
        vault: new ethers_1.Contract(env_1.env.WDK_VAULT_ADDRESS, vaultAbiActual, exports.provider),
        zkOracle: new ethers_1.Contract(env_1.env.WDK_ZK_ORACLE_ADDRESS, oracleAbiActual, exports.provider),
        breaker: new ethers_1.Contract(env_1.env.WDK_BREAKER_ADDRESS, breakerAbiActual, exports.provider),
        engine: new ethers_1.Contract(env_1.env.WDK_ENGINE_ADDRESS, engineAbi, exports.provider),
        auction: new ethers_1.Contract(env_1.env.WDK_AUCTION_ADDRESS || ethers_1.ethers.ZeroAddress, auctionAbiActual, exports.provider),
        syndicate: new ethers_1.Contract(env_1.env.WDK_SYNDICATE_ADDRESS || ethers_1.ethers.ZeroAddress, syndicateAbiActual, exports.provider),
        usdt: new ethers_1.Contract(env_1.env.WDK_USDT_ADDRESS, USDT_ABI, exports.provider),
        provider: exports.provider
    };
};
exports.getContracts = getContracts;

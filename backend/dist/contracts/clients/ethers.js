"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContracts = void 0;
const ethers_1 = require("ethers");
const env_1 = require("@/config/env");
const logger_1 = require("@/utils/logger");
// Load ABIs
const abis_1 = require("../abis");
logger_1.logger.info({ rpcUrl: env_1.env.BNB_RPC_URL }, '[Ethers] Initializing provider');
const provider = new ethers_1.ethers.JsonRpcProvider(env_1.env.BNB_RPC_URL);
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
        vault: new ethers_1.Contract(env_1.env.WDK_VAULT_ADDRESS, vaultAbiActual, provider),
        zkOracle: new ethers_1.Contract(env_1.env.WDK_ZK_ORACLE_ADDRESS, oracleAbiActual, provider),
        breaker: new ethers_1.Contract(env_1.env.WDK_BREAKER_ADDRESS, breakerAbiActual, provider),
        engine: new ethers_1.Contract(env_1.env.WDK_ENGINE_ADDRESS, engineAbi, provider),
        auction: new ethers_1.Contract(env_1.env.WDK_AUCTION_ADDRESS || ethers_1.ethers.ZeroAddress, auctionAbiActual, provider),
        syndicate: new ethers_1.Contract(env_1.env.WDK_SYNDICATE_ADDRESS || ethers_1.ethers.ZeroAddress, syndicateAbiActual, provider),
        usdt: new ethers_1.Contract(env_1.env.WDK_USDT_ADDRESS, USDT_ABI, provider),
        provider
    };
};
exports.getContracts = getContracts;

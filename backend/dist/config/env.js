"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const logger_1 = require("../utils/logger");
// Load .env file (primary configuration)
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
const envPath = path.resolve(process.cwd(), envFile);
dotenv.config({ path: envPath });
// Fallback to .env.wdk for backward compatibility (deprecated)
const legacyEnvPath = path.resolve(process.cwd(), '.env.wdk');
if (fs.existsSync(legacyEnvPath)) {
    logger_1.logger.warn('[Env] Using .env.wdk (deprecated). Please migrate to .env');
    dotenv.config({ path: legacyEnvPath, override: false });
}
logger_1.logger.info({ rpcUrl: process.env.SEPOLIA_RPC_URL }, '[Env] SEPOLIA_RPC_URL from process.env');
const envSchema = zod_1.z.object({
    PORT: zod_1.z.string().default('3001'),
    SEPOLIA_RPC_URL: zod_1.z.string().default('https://ethereum-sepolia.publicnode.com'),
    AGENT_REPORT_URL: zod_1.z.string().optional(),
    AGENT_REPORT_BASE_URL: zod_1.z.string().optional(),
    WDK_SECRET_SEED: zod_1.z.string(),
    WDK_ENGINE_ADDRESS: zod_1.z.string(),
    WDK_ZK_ORACLE_ADDRESS: zod_1.z.string(),
    WDK_BREAKER_ADDRESS: zod_1.z.string(),
    WDK_USDT_ADDRESS: zod_1.z.string().default('0xd077a400968890eacc75cdc901f0356c943e4fdb'), // Sepolia testnet USD₮ (not real tokens)
    WDK_VAULT_ADDRESS: zod_1.z.string(),
    WDK_AUCTION_ADDRESS: zod_1.z.string().optional(),
    WDK_SYNDICATE_ADDRESS: zod_1.z.string().optional(),
    WDK_TWAP_ORACLE_ADDRESS: zod_1.z.string().optional(),
    WDK_MULTI_ORACLE_ADDRESS: zod_1.z.string().optional(),
    WDK_X402_REGISTRY_ADDRESS: zod_1.z.string().optional(),
    WDK_XAUT_ADDRESS: zod_1.z.string().optional(),
    WDK_RISK_POLICY_ADDRESS: zod_1.z.string().optional(),
    WDK_SHARPE_TRACKER_ADDRESS: zod_1.z.string().optional(),
    WDK_AAVE_ADAPTER_ADDRESS: zod_1.z.string().optional(),
    AAVE_V3_POOL_SEPOLIA: zod_1.z.string().default('0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951'),
    WDK_LZ_ADAPTER_ADDRESS: zod_1.z.string().optional(),
    WDK_POLICY_GUARD_ADDRESS: zod_1.z.string().optional(),
    WDK_AGENT_NFA_ADDRESS: zod_1.z.string().optional(),
    AGENT_RISK_PARAMS_ADDRESS: zod_1.z.string().optional(),
    GITHUB_WEBHOOK_SECRET: zod_1.z.string().optional(),
    OPENROUTER_API_KEY: zod_1.z.string().optional(),
    PRIVATE_KEY: zod_1.z.string().optional(),
    OPENROUTER_BASE_URL: zod_1.z.string().default('https://openrouter.ai/api/v1'),
    OPENROUTER_MODEL_GENERAL: zod_1.z.string().default('google/gemini-2.5-flash-lite'),
    OPENROUTER_MODEL_CRYPTO: zod_1.z.string().default('x-ai/grok-4.1-fast'),
    OPENCLAW_GATEWAY_URL: zod_1.z.string().default('https://gateway.openclaw.com/api').optional(),
    OPENCLAW_API_KEY: zod_1.z.string().optional(),
    MAX_OPENCLAW_EXPOSURE_PERCENT: zod_1.z.string().default('20').transform(Number),
    MIN_OPENCLAW_APY: zod_1.z.string().default('8.5').transform(Number),
    VELORA_ROUTER_ADDRESS: zod_1.z.string().default('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'),
    VELORA_FACTORY_ADDRESS: zod_1.z.string().default('0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'),
    // Mainnet addresses
    MAINNET_USDT: zod_1.z.string().default('0xdAC17F958D2ee523a2206206994597C13D831ec7'),
    MAINNET_XAUT: zod_1.z.string().default('0x68749665FF8D2d112Fa859AA293F07A622782F38'),
    MAINNET_WETH: zod_1.z.string().default('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
    DEPLOYMENT_MODE: zod_1.z.enum(['local', 'production']).default('local'),
    AGENT_CRON_SECRET: zod_1.z.string().optional(),
    JWT_SECRET: zod_1.z.string().min(32).optional(),
    // ERC-4337 Smart Accounts (Pimlico v0.7)
    ERC4337_FACTORY_ADDRESS: zod_1.z.string().optional(),
    SIMPLE_ACCOUNT_FACTORY_ADDRESS: zod_1.z.string().optional(),
    ERC4337_PAYMASTER_ADDRESS: zod_1.z.string().default('0x777777777777AeC03fd955926DbF81597e66834C'),
    ERC4337_ENTRYPOINT_ADDRESS: zod_1.z.string().default('0x0000000071727De22E5E9d8BAf0edAc6f37da032'), // v0.7
    ERC4337_BUNDLER_URL: zod_1.z.string().default('https://public.pimlico.io/v2/11155111/rpc'),
    ERC4337_PAYMASTER_URL: zod_1.z.string().default('https://public.pimlico.io/v2/11155111/rpc'),
    ERC4337_SAFE_MODULES_VERSION: zod_1.z.string().default('0.3.0'),
    ERC4337_USDT_TOKEN: zod_1.z.string().default('0xd077a400968890eacc75cdc901f0356c943e4fdb'),
    ERC4337_TRANSFER_MAX_FEE: zod_1.z.string().default('100000').transform(Number),
    ERC4337_ACCOUNT_CREATED_TOPIC: zod_1.z.string().optional(),
    // Redis Queue (optional - falls back to in-memory)
    REDIS_URL: zod_1.z.string().optional(),
    MOCK_AAVE_POOL_ADDRESS: zod_1.z.string().optional(),
    MOCK_BRIDGE_ADDRESS: zod_1.z.string().optional(),
    MOCK_ATOKEN_ADDRESS: zod_1.z.string().optional(),
    AAVE_POOL_ADDRESS: zod_1.z.string().optional(),
    AAVE_V3_POOL_ARBITRUM: zod_1.z.string().default('0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951'),
    USDT_ARBITRUM: zod_1.z.string().default('0xFd086bC7CD5C481DCC9C96ebFK90d351BfA8365'),
    LZ_ENDPOINT_ADDRESS: zod_1.z.string().optional(),
    // x402 Protocol (Semantic Facilitator)
    X402_FACILITATOR_URL: zod_1.z.string().default('https://x402.semanticpay.io/'),
    X402_NETWORK: zod_1.z.string().default('eip155:9745'),
    X402_USDT0_PLASMA: zod_1.z.string().default('0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb'),
    X402_USDT0_STABLE: zod_1.z.string().default('0x779Ded0c9e1022225f8E0630b35a9b54bE713736'),
    LZ_BRIDGE_OPTIONS: zod_1.z.string().default('0x00030100110100000000000000000000000000030d40'),
    DEFAULT_CHAIN_ID: zod_1.z.string().default('11155111').transform(Number),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    logger_1.logger.error({ errors: parsed.error.format() }, '[Env] Invalid environment variables');
    process.exit(1);
}
exports.env = parsed.data;

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
logger_1.logger.info({ rpcUrl: process.env.BNB_RPC_URL }, '[Env] BNB_RPC_URL from process.env');
const envSchema = zod_1.z.object({
    PORT: zod_1.z.string().default('3001'),
    BNB_RPC_URL: zod_1.z.string().default('https://binance.llamarpc.com'),
    SOLANA_RPC_URL: zod_1.z.string().default('https://api.mainnet-beta.solana.com'),
    TON_RPC_URL: zod_1.z.string().default('https://toncenter.com/api/v2/jsonRPC'),
    TON_API_KEY: zod_1.z.string().optional(),
    AGENT_REPORT_URL: zod_1.z.string().optional(),
    AGENT_REPORT_BASE_URL: zod_1.z.string().optional(),
    WDK_SECRET_SEED: zod_1.z.string(),
    WDK_ENGINE_ADDRESS: zod_1.z.string(),
    WDK_ZK_ORACLE_ADDRESS: zod_1.z.string(),
    WDK_BREAKER_ADDRESS: zod_1.z.string(),
    WDK_USDT_ADDRESS: zod_1.z.string(),
    WDK_VAULT_ADDRESS: zod_1.z.string(),
    WDK_AUCTION_ADDRESS: zod_1.z.string().optional(),
    WDK_SYNDICATE_ADDRESS: zod_1.z.string().optional(),
    WDK_XAUT_ADDRESS: zod_1.z.string().optional(),
    WDK_RISK_POLICY_ADDRESS: zod_1.z.string().optional(),
    WDK_SHARPE_TRACKER_ADDRESS: zod_1.z.string().optional(),
    WDK_AAVE_ADAPTER_ADDRESS: zod_1.z.string().optional(),
    WDK_LZ_ADAPTER_ADDRESS: zod_1.z.string().optional(),
    GITHUB_WEBHOOK_SECRET: zod_1.z.string().optional(),
    OPENROUTER_API_KEY: zod_1.z.string().optional(),
    PRIVATE_KEY: zod_1.z.string().optional(),
    SOLANA_PRIVATE_KEY: zod_1.z.string().optional(),
    TON_PRIVATE_KEY: zod_1.z.string().optional(),
    OPENROUTER_BASE_URL: zod_1.z.string().default('https://openrouter.ai/api/v1'),
    OPENROUTER_MODEL_GENERAL: zod_1.z.string().default('google/gemini-2.0-flash-001'),
    OPENROUTER_MODEL_CRYPTO: zod_1.z.string().default('deepseek/deepseek-chat'),
    OPENCLAW_GATEWAY_URL: zod_1.z.string().default('https://gateway.openclaw.com/api').optional(),
    OPENCLAW_API_KEY: zod_1.z.string().optional(),
    MAX_OPENCLAW_EXPOSURE_PERCENT: zod_1.z.string().default('20').transform(Number),
    MIN_OPENCLAW_APY: zod_1.z.string().default('8.5').transform(Number),
    VELORA_ROUTER_ADDRESS: zod_1.z.string().default('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'),
    VELORA_FACTORY_ADDRESS: zod_1.z.string().default('0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'),
    DEPLOYMENT_MODE: zod_1.z.enum(['local', 'production']).default('local'),
    AGENT_CRON_SECRET: zod_1.z.string().optional(),
    JWT_SECRET: zod_1.z.string().min(32).optional(),
    ERC4337_FACTORY_ADDRESS: zod_1.z.string().optional(),
    ERC4337_PAYMASTER_ADDRESS: zod_1.z.string().optional(),
    ERC4337_ENTRYPOINT_ADDRESS: zod_1.z.string().default('0x5FF137D4a0ADCA4B1FB0b8274Ea4dE461a706c12'),
    MOCK_AAVE_POOL_ADDRESS: zod_1.z.string().optional(),
    MOCK_BRIDGE_ADDRESS: zod_1.z.string().optional(),
    MOCK_ATOKEN_ADDRESS: zod_1.z.string().optional(),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    logger_1.logger.error({ errors: parsed.error.format() }, '[Env] Invalid environment variables');
    process.exit(1);
}
exports.env = parsed.data;

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
// Load .env.wdk from parent directory
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env.wdk';
const envPath = path.resolve(process.cwd(), envFile);
dotenv.config({ path: envPath });
// Fallback to regular .env if .env.wdk is missing
dotenv.config();
console.log(`[Env] BNB_RPC_URL from process.env: ${process.env.BNB_RPC_URL}`);
const envSchema = zod_1.z.object({
    PORT: zod_1.z.string().default('3001'),
    BNB_RPC_URL: zod_1.z.string().default('https://binance.llamarpc.com'),
    SOLANA_RPC_URL: zod_1.z.string().default('https://api.mainnet-beta.solana.com'),
    TON_RPC_URL: zod_1.z.string().default('https://toncenter.com/api/v2/jsonRPC'),
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
    GITHUB_WEBHOOK_SECRET: zod_1.z.string().optional(),
    OPENROUTER_API_KEY: zod_1.z.string().optional(),
    OPENROUTER_BASE_URL: zod_1.z.string().default('https://openrouter.ai/api/v1'),
    OPENROUTER_MODEL_GENERAL: zod_1.z.string().default('google/gemini-2.0-flash-exp:free'),
    OPENROUTER_MODEL_CRYPTO: zod_1.z.string().default('deepseek/deepseek-chat'),
    DEPLOYMENT_MODE: zod_1.z.enum(['local', 'production']).default('local'),
    AGENT_CRON_SECRET: zod_1.z.string().optional(),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.format());
    process.exit(1);
}
exports.env = parsed.data;

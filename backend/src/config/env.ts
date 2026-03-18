import { z } from 'zod';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '@/utils/logger';

// Load .env file (primary configuration)
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
const envPath = path.resolve(process.cwd(), envFile);
dotenv.config({ path: envPath });

// Fallback to .env.wdk for backward compatibility (deprecated)
const legacyEnvPath = path.resolve(process.cwd(), '.env.wdk');
if (fs.existsSync(legacyEnvPath)) {
  logger.warn('[Env] Using .env.wdk (deprecated). Please migrate to .env');
  dotenv.config({ path: legacyEnvPath, override: false });
}

logger.info({ rpcUrl: process.env.BNB_RPC_URL }, '[Env] BNB_RPC_URL from process.env');

const envSchema = z.object({
  PORT: z.string().default('3001'),
  BNB_RPC_URL: z.string().default('https://binance.llamarpc.com'),
  SOLANA_RPC_URL: z.string().default('https://api.mainnet-beta.solana.com'),
  TON_RPC_URL: z.string().default('https://toncenter.com/api/v2/jsonRPC'),
  TON_API_KEY: z.string().optional(),
  AGENT_REPORT_URL: z.string().optional(),
  AGENT_REPORT_BASE_URL: z.string().optional(),

  WDK_SECRET_SEED: z.string(),
  
  WDK_ENGINE_ADDRESS: z.string(),
  WDK_ZK_ORACLE_ADDRESS: z.string(),
  WDK_BREAKER_ADDRESS: z.string(),
  WDK_USDT_ADDRESS: z.string(),
  WDK_VAULT_ADDRESS: z.string(),
  WDK_AUCTION_ADDRESS: z.string().optional(),
  WDK_SYNDICATE_ADDRESS: z.string().optional(),
  WDK_XAUT_ADDRESS: z.string().optional(),
  WDK_RISK_POLICY_ADDRESS: z.string().optional(),
  WDK_SHARPE_TRACKER_ADDRESS: z.string().optional(),
  WDK_AAVE_ADAPTER_ADDRESS: z.string().optional(),
  WDK_LZ_ADAPTER_ADDRESS: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  PRIVATE_KEY: z.string().optional(),
  SOLANA_PRIVATE_KEY: z.string().optional(),
  TON_PRIVATE_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL_GENERAL: z.string().default('google/gemini-2.0-flash-001'),
  OPENROUTER_MODEL_CRYPTO: z.string().default('deepseek/deepseek-chat'),

  OPENCLAW_GATEWAY_URL: z.string().default('https://gateway.openclaw.com/api').optional(),
  OPENCLAW_API_KEY: z.string().optional(),
  MAX_OPENCLAW_EXPOSURE_PERCENT: z.string().default('20').transform(Number),
  MIN_OPENCLAW_APY: z.string().default('8.5').transform(Number),

  VELORA_ROUTER_ADDRESS: z.string().default('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'),
  VELORA_FACTORY_ADDRESS: z.string().default('0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'),

  DEPLOYMENT_MODE: z.enum(['local', 'production']).default('local'),
  AGENT_CRON_SECRET: z.string().optional(),
  JWT_SECRET: z.string().min(32).optional(),

  ERC4337_FACTORY_ADDRESS: z.string().optional(),
  ERC4337_PAYMASTER_ADDRESS: z.string().optional(),
  ERC4337_ENTRYPOINT_ADDRESS: z.string().default('0x5FF137D4a0ADCA4B1FB0b8274Ea4dE461a706c12'),

  MOCK_AAVE_POOL_ADDRESS: z.string().optional(),
  MOCK_BRIDGE_ADDRESS: z.string().optional(),
  MOCK_ATOKEN_ADDRESS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  logger.error({ errors: parsed.error.format() }, '[Env] Invalid environment variables');
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;

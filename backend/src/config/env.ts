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

logger.info({ rpcUrl: process.env.SEPOLIA_RPC_URL }, '[Env] SEPOLIA_RPC_URL from process.env');

const envSchema = z.object({
  PORT: z.string().default('3001'),
  SEPOLIA_RPC_URL: z.string().default('https://ethereum-sepolia.publicnode.com'),
  AGENT_REPORT_URL: z.string().optional(),
  AGENT_REPORT_BASE_URL: z.string().optional(),

  WDK_SECRET_SEED: z.string(),
  
  WDK_ENGINE_ADDRESS: z.string(),
  WDK_ZK_ORACLE_ADDRESS: z.string(),
  WDK_BREAKER_ADDRESS: z.string(),
  WDK_USDT_ADDRESS: z.string().default('0xd077a400968890eacc75cdc901f0356c943e4fdb'), // Sepolia testnet USD₮ (not real tokens)
  WDK_VAULT_ADDRESS: z.string(),
  WDK_AUCTION_ADDRESS: z.string().optional(),
  WDK_SYNDICATE_ADDRESS: z.string().optional(),
  WDK_XAUT_ADDRESS: z.string().optional(),
  WDK_RISK_POLICY_ADDRESS: z.string().optional(),
  WDK_SHARPE_TRACKER_ADDRESS: z.string().optional(),
  WDK_AAVE_ADAPTER_ADDRESS: z.string().optional(),
  WDK_LZ_ADAPTER_ADDRESS: z.string().optional(),
  WDK_POLICY_GUARD_ADDRESS: z.string().optional(),
  WDK_AGENT_NFA_ADDRESS: z.string().optional(),
  AGENT_RISK_PARAMS_ADDRESS: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  PRIVATE_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL_GENERAL: z.string().default('google/gemini-2.5-flash-lite'),
  OPENROUTER_MODEL_CRYPTO: z.string().default('x-ai/grok-4.1-fast'),

  OPENCLAW_GATEWAY_URL: z.string().default('https://gateway.openclaw.com/api').optional(),
  OPENCLAW_API_KEY: z.string().optional(),
  MAX_OPENCLAW_EXPOSURE_PERCENT: z.string().default('20').transform(Number),
  MIN_OPENCLAW_APY: z.string().default('8.5').transform(Number),

  VELORA_ROUTER_ADDRESS: z.string().default('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'),
  VELORA_FACTORY_ADDRESS: z.string().default('0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'),

  // Mainnet addresses
  MAINNET_USDT: z.string().default('0xdAC17F958D2ee523a2206206994597C13D831ec7'),
  MAINNET_XAUT: z.string().default('0x68749665FF8D2d112Fa859AA293F07A622782F38'),
  MAINNET_WETH: z.string().default('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),

  DEPLOYMENT_MODE: z.enum(['local', 'production']).default('local'),
  AGENT_CRON_SECRET: z.string().optional(),
  JWT_SECRET: z.string().min(32).optional(),

  // ERC-4337 Smart Accounts (Pimlico v0.7)
  ERC4337_FACTORY_ADDRESS: z.string().optional(),
  ERC4337_PAYMASTER_ADDRESS: z.string().default('0x777777777777AeC03fd955926DbF81597e66834C'),
  ERC4337_ENTRYPOINT_ADDRESS: z.string().default('0x0000000071727De22E5E9d8BAf0edAc6f37da032'), // v0.7
  ERC4337_BUNDLER_URL: z.string().default('https://public.pimlico.io/v2/11155111/rpc'),
  ERC4337_PAYMASTER_URL: z.string().default('https://public.pimlico.io/v2/11155111/rpc'),
  ERC4337_SAFE_MODULES_VERSION: z.string().default('0.3.0'),
  ERC4337_USDT_TOKEN: z.string().default('0xd077a400968890eacc75cdc901f0356c943e4fdb'),
  ERC4337_TRANSFER_MAX_FEE: z.string().default('100000').transform(Number),
  ERC4337_ACCOUNT_CREATED_TOPIC: z.string().optional(),

  // Redis Queue (optional - falls back to in-memory)
  REDIS_URL: z.string().optional(),

  MOCK_AAVE_POOL_ADDRESS: z.string().optional(),
  MOCK_BRIDGE_ADDRESS: z.string().optional(),
  MOCK_ATOKEN_ADDRESS: z.string().optional(),

  AAVE_POOL_ADDRESS: z.string().optional(),
  AAVE_V3_POOL_ARBITRUM: z.string().default('0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951'),
  USDT_ARBITRUM: z.string().default('0xFd086bC7CD5C481DCC9C96ebFK90d351BfA8365'),
  LZ_ENDPOINT_ADDRESS: z.string().optional(),

  // x402 Protocol (Semantic Facilitator)
  X402_FACILITATOR_URL: z.string().default('https://x402.semanticpay.io/'),
  X402_NETWORK: z.string().default('eip155:9745'),
  X402_USDT0_PLASMA: z.string().default('0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb'),
  X402_USDT0_STABLE: z.string().default('0x779Ded0c9e1022225f8E0630b35a9b54bE713736'),
  LZ_BRIDGE_OPTIONS: z.string().default('0x00030100110100000000000000000000000000030d40'),
  DEFAULT_CHAIN_ID: z.string().default('11155111').transform(Number),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  logger.error({ errors: parsed.error.format() }, '[Env] Invalid environment variables');
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;

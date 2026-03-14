import { z } from 'zod';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.wdk from parent directory
dotenv.config({ path: path.resolve(process.cwd(), '.env.wdk') });

const envSchema = z.object({
  PORT: z.string().default('3001'),
  OPENROUTER_API_KEY: z.string(),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL: z.string().default('anthropic/claude-3.5-sonnet'),
  
  BNB_RPC_URL: z.string().default('https://binance.llamarpc.com'),
  WDK_SECRET_SEED: z.string(),
  
  WDK_ENGINE_ADDRESS: z.string(),
  WDK_ZK_ORACLE_ADDRESS: z.string(),
  WDK_BREAKER_ADDRESS: z.string(),
  WDK_USDT_ADDRESS: z.string(),
  WDK_VAULT_ADDRESS: z.string(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;

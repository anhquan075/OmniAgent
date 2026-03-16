import { env } from '@/config/env';

export const HIGH_RISK_DRAWDOWN_BPS = 2000;
export const MEDIUM_RISK_DRAWDOWN_BPS = 1000;
export const PAUSE_SELECTOR = '0x8456d592';
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/simple/price';
export const OPENROUTER_DEFAULT_URL = 'https://openrouter.ai/api/v1';

function getServerBaseUrl(): string {
  if (env.AGENT_REPORT_BASE_URL) {
    return env.AGENT_REPORT_BASE_URL;
  }
  return `http://localhost:${env.PORT}`;
}

export const LOCAL_SERVER_URL = `${getServerBaseUrl()}/api/agent/report`;

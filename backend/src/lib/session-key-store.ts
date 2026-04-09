import { encryptPrivateKey, decryptPrivateKey } from './crypto-utils';

function getMasterSecret(): string {
  const secret = process.env.SESSION_KEY_MASTER_SECRET;
  if (secret) return secret;
  
  // Only allow insecure fallback in development
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[Security] SESSION_KEY_MASTER_SECRET environment variable is required in production');
  }
  
  // Warn about insecure fallback in dev
  if (process.env.NODE_ENV !== 'test') {
    console.warn('[Security] Using default session key master secret - NOT SAFE FOR PRODUCTION');
  }
  return 'default-dev-secret-change-in-production';
}

export interface StoredSessionKey {
  ownerAddress: string;
  smartAccount: string;
  sessionKeyAddress: string;
  encryptedPrivateKey: string;
  dailyLimitUSD: number;
  allowedTargets: string[];
  createdAt: Date;
  expiresAt: Date;
  revoked: boolean;
}

interface DailySpentTracker {
  amountUSD: number;
  resetTime: number;
}

const sessionKeyStore = new Map<string, StoredSessionKey>();
const dailySpentTrackers = new Map<string, DailySpentTracker>();

const RATE_LIMIT_MAX_KEYS = 5;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const rateLimitCounters = new Map<string, { count: number; resetTime: number }>();

export async function storeSessionKey(
  ownerAddress: string,
  sessionKey: StoredSessionKey
): Promise<void> {
  const key = ownerAddress.toLowerCase();
  
  if (!sessionKey.encryptedPrivateKey) {
    throw new Error('Cannot store session key without encryption');
  }
  
  sessionKeyStore.set(key, sessionKey);
}

export async function getSessionKey(
  ownerAddress: string
): Promise<StoredSessionKey | null> {
  const key = ownerAddress.toLowerCase();
  const stored = sessionKeyStore.get(key);
  
  if (!stored) return null;
  if (stored.revoked) return null;
  if (stored.expiresAt < new Date()) return null;
  
  return stored;
}

export async function getSessionKeyStatus(
  ownerAddress: string
): Promise<{
  active: boolean;
  dailyLimitUSD: number;
  dailySpentUSD: number;
  expiresAt: string | null;
  allowedTargets: string[];
  resetAt: string;
}> {
  const stored = await getSessionKey(ownerAddress);
  
  if (!stored) {
    return {
      active: false,
      dailyLimitUSD: 0,
      dailySpentUSD: 0,
      expiresAt: null,
      allowedTargets: [],
      resetAt: new Date().toISOString()
    };
  }
  
  const trackerKey = `${ownerAddress.toLowerCase()}:${stored.sessionKeyAddress}`;
  const tracker = dailySpentTrackers.get(trackerKey);
  const now = Date.now();
  
  let dailySpentUSD = 0;
  let resetAt = now + 24 * 60 * 60 * 1000;
  
  if (tracker && tracker.resetTime > now) {
    dailySpentUSD = tracker.amountUSD;
    resetAt = tracker.resetTime;
  }
  
  return {
    active: true,
    dailyLimitUSD: stored.dailyLimitUSD,
    dailySpentUSD,
    expiresAt: stored.expiresAt.toISOString(),
    allowedTargets: stored.allowedTargets,
    resetAt: new Date(resetAt).toISOString()
  };
}

export async function revokeSessionKey(ownerAddress: string): Promise<void> {
  const key = ownerAddress.toLowerCase();
  const stored = sessionKeyStore.get(key);
  if (stored) {
    stored.revoked = true;
    sessionKeyStore.set(key, stored);
  }
}

export async function updateDailyLimit(
  ownerAddress: string,
  newLimitUSD: number
): Promise<void> {
  const key = ownerAddress.toLowerCase();
  const stored = sessionKeyStore.get(key);
  if (stored) {
    stored.dailyLimitUSD = newLimitUSD;
    sessionKeyStore.set(key, stored);
  }
}

export async function getSessionKeyInfo(ownerAddress: string): Promise<{
  sessionKeyAddress: string;
  expiresAt: Date;
  dailyLimitUSD: number;
  allowedTargets: string[];
} | null> {
  const stored = await getSessionKey(ownerAddress);
  if (!stored) return null;
  
  return {
    sessionKeyAddress: stored.sessionKeyAddress,
    expiresAt: stored.expiresAt,
    dailyLimitUSD: stored.dailyLimitUSD,
    allowedTargets: stored.allowedTargets
  };
}

export async function decryptSessionKey(
  ownerAddress: string,
  masterSecret?: string
): Promise<string | null> {
  const stored = await getSessionKey(ownerAddress);
  if (!stored) return null;
  
  const secret = masterSecret || getMasterSecret();
  try {
    return decryptPrivateKey(stored.encryptedPrivateKey, secret);
  } catch {
    return null;
  }
}

export function checkRateLimit(ownerAddress: string): boolean {
  const key = ownerAddress.toLowerCase();
  const now = Date.now();
  
  let counter = rateLimitCounters.get(key);
  if (!counter || counter.resetTime < now) {
    counter = { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
    rateLimitCounters.set(key, counter);
  }
  
  if (counter.count >= RATE_LIMIT_MAX_KEYS) {
    return false;
  }
  
  counter.count++;
  return true;
}

export async function getAllSessionKeys(): Promise<StoredSessionKey[]> {
  return Array.from(sessionKeyStore.values());
}

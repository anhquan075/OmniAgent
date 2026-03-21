import { encryptPrivateKey, decryptPrivateKey } from './crypto-utils';

function getMasterSecret(): string {
  return process.env.SESSION_KEY_MASTER_SECRET || 'default-dev-secret-change-in-production';
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

export async function revokeSessionKey(
  ownerAddress: string
): Promise<void> {
  const key = ownerAddress.toLowerCase();
  const stored = sessionKeyStore.get(key);
  
  if (stored) {
    stored.revoked = true;
    sessionKeyStore.set(key, stored);
  }
}

export async function decryptSessionKey(
  ownerAddress: string
): Promise<string | null> {
  const stored = await getSessionKey(ownerAddress);
  
  if (!stored) return null;
  
  try {
    return decryptPrivateKey(stored.encryptedPrivateKey, getMasterSecret());
  } catch {
    throw new Error('Failed to decrypt session key');
  }
}

export async function updateDailyLimit(
  ownerAddress: string,
  newLimitUSD: number
): Promise<void> {
  const key = ownerAddress.toLowerCase();
  const stored = sessionKeyStore.get(key);
  
  if (!stored) {
    throw new Error('Session key not found');
  }
  
  stored.dailyLimitUSD = newLimitUSD;
  sessionKeyStore.set(key, stored);
}

export function checkRateLimit(ownerAddress: string): boolean {
  const key = ownerAddress.toLowerCase();
  const now = Date.now();
  const counter = rateLimitCounters.get(key);
  
  if (!counter || counter.resetTime < now) {
    rateLimitCounters.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (counter.count >= RATE_LIMIT_MAX_KEYS) {
    return false;
  }
  
  counter.count++;
  rateLimitCounters.set(key, counter);
  return true;
}

export function recordTransaction(
  ownerAddress: string,
  sessionKeyAddress: string,
  amountUSD: number
): void {
  const trackerKey = `${ownerAddress.toLowerCase()}:${sessionKeyAddress}`;
  const now = Date.now();
  const tracker = dailySpentTrackers.get(trackerKey);
  
  if (!tracker || tracker.resetTime < now) {
    dailySpentTrackers.set(trackerKey, {
      amountUSD,
      resetTime: now + 24 * 60 * 60 * 1000
    });
    return;
  }
  
  tracker.amountUSD += amountUSD;
  dailySpentTrackers.set(trackerKey, tracker);
}

/**
 * NAV Shield — Protection against trades that crash vault unit price.
 *
 * Prevents any swap from reducing the vault's NAV per share by more than
 * MAX_NAV_DROP_PCT (10%) compared to:
 * - The pre-swap NAV, OR
 * - The 24-hour rolling baseline (whichever is higher)
 *
 * ## Adaptation for ERC4626 Vault
 *
 * Our vault (OmniAgentVault) extends ERC4626, so NAV per share is:
 *   navPerShare = totalAssets() / totalSupply()
 *
 * Unlike Rigoblock's vault, we don't have atomic multicall([swap, getNavDataView]).
 * Instead, we:
 * 1. Read current totalAssets() and totalSupply()
 * 2. Calculate pre-swap NAV per share
 * 3. Estimate swap output from DEX quote
 * 4. Simulate post-swap totalAssets = preAssets - inputAmount + outputAmount
 * 5. Calculate expected NAV drop
 * 6. Block if drop > threshold
 *
 * ## Fail-Closed Policy
 *
 * If we can't read vault state, the shield returns `allowed: false`.
 * We NEVER allow trades when we can't verify NAV impact.
 *
 * ## Limitations vs Rigoblock
 *
 * This is an ESTIMATE, not an atomic simulation:
 * - DEX quotes may differ from execution price (slippage)
 * - Doesn't account for swap fees deducted from output
 * - Doesn't account for adapter fees or dust
 * 
 * We add a safety buffer (5%) to account for these inaccuracies.
 */

import { ethers } from 'ethers';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import * as fs from 'fs';
import * as path from 'path';

// ── Constants ────────────────────────────────────────────────────────

/** Maximum allowed NAV drop per transaction (10%) */
const DEFAULT_MAX_NAV_DROP_PCT = 10;

/** Safety buffer to account for quote inaccuracies (+5%) */
const SAFETY_BUFFER_PCT = 5;

/** 24 hours in milliseconds */
const BASELINE_TTL_MS = 24 * 60 * 60 * 1000;

/** File path for baseline persistence (Railway Volume: /app/cache) */
const BASELINE_FILE = process.env.BASELINE_STORAGE_PATH 
  || path.join(process.cwd(), 'cache', 'nav-baseline.json');

// ── ERC4626 Vault ABI (minimal) ──────────────────────────────────────

const VAULT_ABI = [
  'function totalAssets() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function asset() view returns (address)',
  'function convertToShares(uint256 assets) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
];

// ── Types ────────────────────────────────────────────────────────────

interface NavData {
  totalAssets: bigint;
  totalSupply: bigint;
  navPerShare: bigint; // 18 decimals
  timestamp: number;
}

interface NavBaseline {
  navPerShare: string; // bigint serialized as string
  recordedAt: number;
  totalAssets: string;
}

export interface NavShieldResult {
  allowed: boolean;
  /** Whether NAV impact was actually measured */
  verified: boolean;
  /** NAV per share before (18 decimals) */
  preNavPerShare: string;
  /** Estimated NAV per share after (18 decimals) */
  postNavPerShare: string;
  /** Drop percentage (e.g., "2.5" means 2.5% drop) */
  dropPct: string;
  /** 24h baseline NAV if available */
  baselineNavPerShare?: string;
  /** Human-readable reason */
  reason?: string;
  /** Error code for API consumers */
  code?: 'BLOCKED' | 'SIMULATION_FAILED' | 'UNVERIFIED';
}

// ── Baseline Storage (file-based, KV in production) ──────────────────

function ensureCacheDir(): void {
  const cacheDir = path.dirname(BASELINE_FILE);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
}

function loadBaseline(vaultAddress: string, chainId: number): NavBaseline | null {
  try {
    ensureCacheDir();
    if (!fs.existsSync(BASELINE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
    const key = `${vaultAddress.toLowerCase()}:${chainId}`;
    const baseline = data[key];
    if (!baseline) return null;
    // Check if expired
    if (Date.now() - baseline.recordedAt > BASELINE_TTL_MS) {
      return null;
    }
    return baseline;
  } catch {
    return null;
  }
}

function storeBaseline(vaultAddress: string, chainId: number, nav: NavData): void {
  try {
    ensureCacheDir();
    let data: Record<string, NavBaseline> = {};
    if (fs.existsSync(BASELINE_FILE)) {
      data = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
    }
    const key = `${vaultAddress.toLowerCase()}:${chainId}`;
    data[key] = {
      navPerShare: nav.navPerShare.toString(),
      recordedAt: Date.now(),
      totalAssets: nav.totalAssets.toString(),
    };
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    logger.warn({ err }, '[NavShield] Failed to store baseline');
  }
}

// ── Core NAV Calculation ─────────────────────────────────────────────

/**
 * Read current NAV per share from the vault.
 */
async function readVaultNav(
  provider: ethers.JsonRpcProvider,
  vaultAddress: string,
): Promise<NavData | null> {
  try {
    const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);
    
    const [totalAssets, totalSupply] = await Promise.all([
      vault.totalAssets() as Promise<bigint>,
      vault.totalSupply() as Promise<bigint>,
    ]);

    if (totalSupply === 0n) {
      return {
        totalAssets,
        totalSupply: 0n,
        navPerShare: ethers.parseUnits('1', 18), // Default 1:1
        timestamp: Date.now(),
      };
    }

    // NAV per share = (totalAssets * 1e18) / totalSupply
    const navPerShare = (totalAssets * ethers.parseUnits('1', 18)) / totalSupply;

    return {
      totalAssets,
      totalSupply,
      navPerShare,
      timestamp: Date.now(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, vaultAddress }, '[NavShield] Failed to read vault NAV');
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Check if a swap would drop the vault's NAV per share below threshold.
 *
 * @param vaultAddress - Vault contract address
 * @param inputTokenAddress - Token being sold
 * @param inputAmount - Amount selling (in token decimals)
 * @param expectedOutputAmount - Expected output from DEX quote (in output token decimals)
 * @param inputTokenPriceUsdt - Price of input token in USDT (18 decimals)
 * @param outputTokenPriceUsdt - Price of output token in USDT (18 decimals)
 * @param maxDropPct - Maximum allowed NAV drop (default: 10%)
 * @returns NavShieldResult with allowed=true/false
 */
export async function checkNavImpact(params: {
  vaultAddress: string;
  inputAmount: bigint;
  expectedOutputAmount: bigint;
  inputTokenPriceUsdt: bigint;
  outputTokenPriceUsdt: bigint;
  chainId?: number;
  maxDropPct?: number;
}): Promise<NavShieldResult> {
  const {
    vaultAddress,
    inputAmount,
    expectedOutputAmount,
    inputTokenPriceUsdt,
    outputTokenPriceUsdt,
    chainId = 11155111,
    maxDropPct = DEFAULT_MAX_NAV_DROP_PCT,
  } = params;

  const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
  const preNav = await readVaultNav(provider, vaultAddress);

  if (!preNav) {
    logger.error('[NavShield] ✗ BLOCKED: Could not read vault NAV');
    return {
      allowed: false,
      verified: false,
      preNavPerShare: '0',
      postNavPerShare: '0',
      dropPct: '0',
      code: 'SIMULATION_FAILED',
      reason: 'Cannot read vault NAV — vault may be unreachable or not deployed',
    };
  }

  // Empty vault — nothing to protect
  if (preNav.totalAssets === 0n || preNav.totalSupply === 0n) {
    logger.info('[NavShield] Empty vault (totalAssets=0) — allowing');
    return {
      allowed: true,
      verified: true,
      preNavPerShare: preNav.navPerShare.toString(),
      postNavPerShare: preNav.navPerShare.toString(),
      dropPct: '0',
      reason: 'Empty vault — no NAV impact possible',
    };
  }

  // ── Step 2: Calculate trade impact in USDT ──
  // Input value leaving vault = inputAmount * inputPrice
  // Output value entering vault = outputAmount * outputPrice
  const inputValueUsdt = (inputAmount * inputTokenPriceUsdt) / BigInt(10 ** 18);
  const outputValueUsdt = (expectedOutputAmount * outputTokenPriceUsdt) / BigInt(10 ** 18);

  // Net value change (negative = loss)
  const netValueChangeUsdt = outputValueUsdt - inputValueUsdt;

  logger.info({
    inputValueUsdt: ethers.formatUnits(inputValueUsdt, 18),
    outputValueUsdt: ethers.formatUnits(outputValueUsdt, 18),
    netChangeUsdt: ethers.formatUnits(netValueChangeUsdt, 18),
  }, '[NavShield] Trade value analysis');

  // ── Step 3: Calculate expected new totalAssets ──
  // If net change is negative, totalAssets decreases
  const postTotalAssets = preNav.totalAssets + netValueChangeUsdt;

  if (postTotalAssets <= 0n) {
    logger.warn('[NavShield] ✗ BLOCKED: Trade would zero out vault');
    return {
      allowed: false,
      verified: true,
      code: 'BLOCKED',
      preNavPerShare: preNav.navPerShare.toString(),
      postNavPerShare: '0',
      dropPct: '100',
      reason: 'Trade would completely drain vault assets',
    };
  }

  // ── Step 4: Calculate NAV per share after trade ──
  const postNavPerShare = (postTotalAssets * ethers.parseUnits('1', 18)) / preNav.totalSupply;

  // ── Step 5: Calculate drop percentage ──
  let dropPct: number;
  if (preNav.navPerShare >= postNavPerShare) {
    const dropWei = preNav.navPerShare - postNavPerShare;
    dropPct = Number((dropWei * 10000n) / preNav.navPerShare) / 100;
  } else {
    dropPct = 0; // NAV increased — always allowed
  }

  // Add safety buffer for quote inaccuracies
  const effectiveDropPct = dropPct + SAFETY_BUFFER_PCT;

  logger.info({
    preNavPerShare: ethers.formatUnits(preNav.navPerShare, 18),
    postNavPerShare: ethers.formatUnits(postNavPerShare, 18),
    rawDropPct: dropPct.toFixed(4),
    effectiveDropPct: effectiveDropPct.toFixed(4),
    maxAllowed: maxDropPct,
  }, '[NavShield] NAV impact calculation');

  // ── Step 6: Check 24h baseline ──
  let baselineNavPerShare: bigint | undefined;
  const baseline = loadBaseline(vaultAddress, chainId);
  if (baseline) {
    baselineNavPerShare = BigInt(baseline.navPerShare);
    logger.info({
      baseline: ethers.formatUnits(baselineNavPerShare, 18),
      recordedAgo: `${Math.round((Date.now() - baseline.recordedAt) / 60000)}min`,
    }, '[NavShield] 24h baseline loaded');
  } else {
    // Store current as baseline
    storeBaseline(vaultAddress, chainId, preNav);
    logger.info('[NavShield] No baseline — stored current NAV as baseline');
  }

  // Use higher of: current NAV or 24h baseline
  const referenceNav = baselineNavPerShare && baselineNavPerShare > preNav.navPerShare
    ? baselineNavPerShare
    : preNav.navPerShare;

  // Recalculate drop from reference
  let dropFromRefPct: number;
  if (referenceNav >= postNavPerShare) {
    const dropWei = referenceNav - postNavPerShare;
    dropFromRefPct = Number((dropWei * 10000n) / referenceNav) / 100;
  } else {
    dropFromRefPct = 0;
  }

  const effectiveDropFromRefPct = dropFromRefPct + SAFETY_BUFFER_PCT;

  // ── Step 7: Enforce threshold ──
  if (effectiveDropFromRefPct > maxDropPct) {
    logger.warn({
      dropPct: effectiveDropFromRefPct.toFixed(2),
      maxAllowed: maxDropPct,
      reference: referenceNav.toString(),
    }, '[NavShield] ✗ BLOCKED: NAV drop exceeds threshold');

    return {
      allowed: false,
      verified: true,
      code: 'BLOCKED',
      preNavPerShare: preNav.navPerShare.toString(),
      postNavPerShare: postNavPerShare.toString(),
      dropPct: effectiveDropFromRefPct.toFixed(2),
      baselineNavPerShare: baselineNavPerShare?.toString(),
      reason: `Trade would reduce vault NAV by ~${effectiveDropFromRefPct.toFixed(2)}% ` +
        `(max allowed: ${maxDropPct}%, includes ${SAFETY_BUFFER_PCT}% safety buffer). ` +
        `This protects depositors from excessive value impact.`,
    };
  }

  // ── Step 8: Update baseline if needed ──
  if (!baseline || (Date.now() - baseline.recordedAt) > BASELINE_TTL_MS) {
    storeBaseline(vaultAddress, chainId, preNav);
  }

  logger.info({
    dropPct: effectiveDropFromRefPct.toFixed(2),
    maxAllowed: maxDropPct,
  }, '[NavShield] ✓ ALLOWED: NAV drop within limit');

  return {
    allowed: true,
    verified: true,
    preNavPerShare: preNav.navPerShare.toString(),
    postNavPerShare: postNavPerShare.toString(),
    dropPct: effectiveDropFromRefPct.toFixed(2),
    baselineNavPerShare: baselineNavPerShare?.toString(),
  };
}

/**
 * Check NAV impact for a bridge (assets leaving the chain).
 *
 * Bridge transfers inherently reduce source-chain NAV by the transfer amount.
 * Use a higher threshold (87%) — the on-chain contract enforces its own
 * minimum supply ratio (12.5% must remain).
 */
export async function checkBridgeNavImpact(params: {
  vaultAddress: string;
  bridgeAmountUsdt: bigint;
  chainId?: number;
}): Promise<NavShieldResult> {
  return checkNavImpact({
    ...params,
    // For bridges, the input is value leaving, output is 0 (assets go to another chain)
    inputAmount: params.bridgeAmountUsdt,
    expectedOutputAmount: 0n,
    inputTokenPriceUsdt: ethers.parseUnits('1', 18), // 1:1 for USDT
    outputTokenPriceUsdt: 0n,
    maxDropPct: 87, // Allow up to 87% NAV drop for bridges
  });
}

/**
 * Get current vault NAV info (for dashboard/API).
 */
export async function getVaultNavInfo(
  vaultAddress: string,
  chainId: number = 11155111,
): Promise<{
  navPerShare: string;
  totalAssets: string;
  totalSupply: string;
  baseline?: NavBaseline;
} | null> {
  const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
  const nav = await readVaultNav(provider, vaultAddress);
  if (!nav) return null;

  const baseline = loadBaseline(vaultAddress, chainId);

  return {
    navPerShare: ethers.formatUnits(nav.navPerShare, 18),
    totalAssets: ethers.formatUnits(nav.totalAssets, 18),
    totalSupply: ethers.formatUnits(nav.totalSupply, 18),
    baseline: baseline ? {
      ...baseline,
      navPerShare: ethers.formatUnits(BigInt(baseline.navPerShare), 18),
    } : undefined,
  };
}

// ── Singleton ────────────────────────────────────────────────────────

let instance: NavShield | null = null;

export class NavShield {
  constructor(private vaultAddress: string, private chainId: number = env.DEFAULT_CHAIN_ID) {}

  async checkSwap(params: {
    inputAmount: bigint;
    expectedOutputAmount: bigint;
    inputTokenPriceUsdt: bigint;
    outputTokenPriceUsdt: bigint;
    maxDropPct?: number;
  }): Promise<NavShieldResult> {
    return checkNavImpact({
      vaultAddress: this.vaultAddress,
      chainId: this.chainId,
      ...params,
    });
  }

  async checkBridge(bridgeAmountUsdt: bigint): Promise<NavShieldResult> {
    return checkBridgeNavImpact({
      vaultAddress: this.vaultAddress,
      bridgeAmountUsdt,
      chainId: this.chainId,
    });
  }

  async getInfo() {
    return getVaultNavInfo(this.vaultAddress, this.chainId);
  }
}

export function getNavShield(vaultAddress?: string, chainId?: number): NavShield {
  if (!instance || vaultAddress) {
    const addr = vaultAddress || env.WDK_VAULT_ADDRESS;
    if (!addr) throw new Error('NavShield: vault address required');
    instance = new NavShield(addr, chainId || env.DEFAULT_CHAIN_ID);
  }
  return instance;
}

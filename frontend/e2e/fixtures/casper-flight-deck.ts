import type { Page } from '@playwright/test';

import { linkedSnapshot } from './casper-dashboard-snapshot';

export const latestReceipt = {
  decisionId: 'casper-live-20260702-receipt-001',
  action: 'haircut',
  riskScore: 72,
  timestamp: '2026-07-02T14:44:03+00:00',
  deployHash: 'ddef65a6d533eecd4c4721a3cb8792c73bb483e2068a03b5a2d86022828a9736',
  proofDigest: 'sha256:95c27f7aeffaf7f994b8edc824547a8f9142d5c8159368f020912627eac6158f',
  rationaleHash: 'sha256:87f7c5b2f5f0d2ff2f930706cfb45a03ad49a2a3bbad9936c9b5c27ca70d8a44',
  policyGate: 'approved',
  eventType: 'casper_decision_submitted',
};

export const olderReceipt = {
  decisionId: 'rwa-collateral-demo-001',
  action: 'approve',
  riskScore: 22,
  timestamp: '2026-07-03T10:00:00+00:00',
  proofDigest: 'sha256:older-proof-digest',
  policyGate: 'blocked',
  eventType: 'casper_decision_blocked',
};

export async function routeSnapshot(page: Page, snapshot = linkedSnapshot) {
  await page.route('**/api/dashboard/snapshot?limit=8', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(snapshot),
  }));
  await page.route('**/api/dashboard/stream?limit=8', route => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    headers: { 'Cache-Control': 'no-cache' },
    body: `event: dashboard_snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`,
  }));
}

export async function routeReceipts(page: Page, receipts = [olderReceipt, latestReceipt]) {
  await page.route('**/api/dashboard/receipts**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ network: 'casper', receipts, count: receipts.length }),
  }));
}

export async function routePublicProof(page: Page, x402: Record<string, unknown> = {
  status: 'unavailable',
  endpoint: 'https://example.invalid/casper/x402-evidence',
  receipt: null,
}) {
  await page.route('**/api/public/proof', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      network: 'casper',
      scenario: 'rwa-collateral-nav-risk-receipt',
      status: 'live_verified',
      x402,
    }),
  }));
}

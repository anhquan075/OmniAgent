import { expect, test } from '@playwright/test';

import { linkedSnapshot } from '../fixtures/casper-dashboard-snapshot';
import { latestReceipt, olderReceipt, routePublicProof, routeReceipts, routeSnapshot } from '../fixtures/casper-flight-deck';

test('live submit stays guarded when preflight is blocked even if backend setting is enabled', async ({ page }) => {
  await routeSnapshot(page, {
    ...linkedSnapshot,
    backendHealth: { ...linkedSnapshot.backendHealth, liveSubmitEnabled: true },
    casperAgentRuntime: {
      ...linkedSnapshot.casperAgentRuntime,
      preflight: { status: 'blocked', liveSubmitEnabled: false, hardBlockers: ['casper_account_missing'] },
    },
    casperProofBundle: {
      ...linkedSnapshot.casperProofBundle,
      preflight: { status: 'blocked', liveSubmitEnabled: false, hardBlockers: ['casper_account_missing'] },
    },
  });

  await page.goto('/');
  await expect(page.locator('[data-live-submit-status="guarded"]')).toBeVisible();
  await expect(page.locator('[data-live-submit-status="enabled"]')).toHaveCount(0);
});

test('x402 settlement shows verified only with public proof receipt metadata', async ({ page }) => {
  await routeSnapshot(page);
  const publicProofResponse = page.waitForResponse(response => response.url().includes('/api/public/proof'));
  await routePublicProof(page, {
    status: 'settled',
    receipt: { receiptHash: 'x402-receipt-abc123', receiptId: 'paid-1', provider: 'x402' },
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Proof Packet' }).click();
  await publicProofResponse;

  await expect(page.locator('[data-x402-status="verified"]')).toBeVisible();
  await expect(page.locator('[data-evidence-field="x402"]')).toContainText('verified');
});

test('dashboard shows guarded proof state when hashes are missing', async ({ page }) => {
  await routeSnapshot(page, {
    ...linkedSnapshot,
    casperProofBundle: {
      ...linkedSnapshot.casperProofBundle,
      status: 'blocked',
      deployStatus: { status: 'not_submitted' },
      readback: { verified: false, status: 'missing' },
      lifecycle: [{ state: 'submit', status: 'not_submitted' }],
    },
  });
  await routePublicProof(page);

  await page.goto('/');
  await expect(page.getByLabel('Receipt flow timeline')).toContainText('not submitted');
  await page.getByRole('button', { name: 'Proof Packet' }).click();
  await expect(page.locator('[data-proof-link="deploy-hash"]')).toHaveCount(0);
  await expect(page.locator('.judge-packet')).toContainText('blocked');
});

test('fallback snapshot never renders as normal evidence or clear recovery state', async ({ page }) => {
  await page.route('**/api/dashboard/snapshot?limit=8', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'offline' }),
  }));
  await routeReceipts(page, []);

  await page.goto('/');
  await expect(page.getByText('Snapshot unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('Recovery state unavailable')).toBeVisible();
  await expect(page.getByText('Casper proof gates are clear.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Proof Packet' }).click();
  await expect(page.getByRole('button', { name: 'Verify receipt' })).toBeDisabled();
  await expect(page.locator('[data-evidence-field="scenario"]')).toContainText('no evidence');
  await expect(page.locator('[data-x402-status="unavailable"]')).toBeVisible();
  await expect(page.getByText(latestReceipt.decisionId)).toHaveCount(0);
});

test('silent refresh failure quarantines stale proof actions', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/dashboard/snapshot?limit=8', route => {
    calls += 1;
    const available = calls <= 2;
    void route.fulfill({
      status: available ? 200 : 503,
      contentType: 'application/json',
      body: JSON.stringify(available ? linkedSnapshot : { detail: 'offline' }),
    });
  });
  await routePublicProof(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'Proof Packet' }).click();
  await expect(page.getByRole('button', { name: 'Verify receipt' })).toBeEnabled();
  await page.waitForResponse(response => (
    response.url().includes('/api/dashboard/snapshot') && response.status() === 503
  ), { timeout: 10000 });

  await expect(page.getByText('Snapshot unavailable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify receipt' })).toBeDisabled();
  await expect(page.locator('[data-evidence-field="scenario"]')).toContainText('no evidence');
});

test('receipt ledger scopes latest proof to the selected decision id', async ({ page }) => {
  await routeSnapshot(page);
  await routeReceipts(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Receipt Ledger' }).click();

  const inspector = page.locator('[data-receipt-inspector]');
  await expect(page.getByRole('button', { name: `Inspect receipt ${latestReceipt.decisionId}` })).toBeVisible();
  await expect(inspector).toContainText('Latest proof');
  await expect(inspector).toContainText('Readback verified');
  await expect(inspector).toContainText('yes');

  await page.getByRole('button', { name: 'blocked' }).click();
  await expect(page.getByRole('button', { name: `Inspect receipt ${olderReceipt.decisionId}` })).toBeVisible();
  await expect(page.getByRole('button', { name: `Inspect receipt ${latestReceipt.decisionId}` })).toHaveCount(0);
  await expect(inspector).toContainText('Row only');
  await expect(inspector).toContainText('not row-scoped');
  await expect(inspector).toContainText('latest proof not attached to this row');
});

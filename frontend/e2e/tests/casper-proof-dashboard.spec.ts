import { expect, test } from '@playwright/test';

import { routePublicProof, routeReceipts, routeSnapshot } from '../fixtures/casper-flight-deck';

test('dashboard shows Casper Receipt Flight Deck shell', async ({ page }) => {
  const snapshotResponse = page.waitForResponse(response => (
    response.url().includes('/api/dashboard/snapshot') && response.status() === 200
  ));
  await page.goto('/');
  const snapshot = await (await snapshotResponse).json();

  expect(snapshot.network).toBe('casper');
  expect(snapshot.casperAgentRuntime.network).toBe('casper');
  await expect(page.getByAltText('OmniAgent mascot')).toBeVisible();
  await expect(page.getByText('Receipt Flight Deck').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Casper proof console' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cockpit' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Proof Packet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Receipt Ledger' })).toBeVisible();
  await expect(page.getByLabel('Receipt flow timeline')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Agent loop' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'MCP activity log' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI output' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Policy gates summary' })).toBeVisible();
  await expect(page.getByText(/local fallback:/)).toHaveCount(0);
  await expect(page.getByText(['AI decision', 'agent'].join(' '))).toHaveCount(0);
  await expect(page.getByText(new RegExp(['Senti', 'nel'].join('')))).toHaveCount(0);
});

test('proof packet exposes judge links without treating x402 endpoint as settlement proof', async ({ page }) => {
  await routeSnapshot(page);
  await routePublicProof(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Proof Packet' }).click();

  const deployUrl = 'https://testnet.cspr.live/deploy/ddef65a6d533eecd4c4721a3cb8792c73bb483e2068a03b5a2d86022828a9736';
  await expect(page.getByRole('heading', { name: 'Judge packet' })).toBeVisible();
  await expect(page.locator('[data-proof-link="decision-id"]')).toHaveAttribute('href', deployUrl);
  await expect(page.locator('[data-proof-link="deploy-hash"]')).toHaveAttribute('href', deployUrl);
  await expect(page.locator('[data-proof-link="account"]')).toHaveAttribute('href', /\/account\/0203a586/);
  await expect(page.locator('[data-proof-link="contract"]')).toHaveAttribute('href', /\/contract\/5a82529f/);
  await expect(page.locator('[data-proof-link="package"]')).toHaveAttribute('href', /\/contract-package\/46cf5754/);
  await expect(page.getByRole('button', { name: 'Copy replay command' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy receipt digest' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify receipt' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Public proof' })).toHaveAttribute('href', '/api/public/proof');
  await expect(page.getByRole('link', { name: 'Agent card' })).toHaveAttribute('href', '/.well-known/casper-agent-card.json');
  await expect(page.locator('[data-evidence-field="source"] a')).toHaveAttribute('href', 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates');
  await expect(page.locator('[data-x402-status="unavailable"]')).toBeVisible();
  await expect(page.locator('[data-x402-status="verified"]')).toHaveCount(0);
  await expect(page.locator('[data-evidence-field="x402"]')).toContainText('unavailable');
});

test('dashboard renders MCP calls and AI role output from the proof bundle', async ({ page }) => {
  await routeSnapshot(page);
  await page.goto('/');

  await expect(page.getByText('casper_rwa_evidence')).toBeVisible();
  await expect(page.getByText('casper_guardrails')).toBeVisible();
  await expect(page.getByText('casper_record_readback')).toBeVisible();
  await expect(page.getByText('Treasury collateral yield crossed the policy band')).toBeVisible();
  await expect(page.getByLabel('AI output').getByText('proposer')).toBeVisible();
  await expect(page.getByLabel('AI output').getByText('policy gate')).toBeVisible();
});

test('dashboard stays responsive across Flight Deck viewports', async ({ page }) => {
  await routeSnapshot(page);
  await routePublicProof(page);
  await routeReceipts(page, []);
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { animation: none !important; }';
    document.documentElement.appendChild(style);
  });

  for (const viewport of [
    { width: 320, height: 720 },
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1180, height: 900 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');

    await expect(page.getByAltText('OmniAgent mascot')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Casper proof console' })).toBeAttached();
    await expect(page.getByLabel('Receipt flow timeline')).toBeAttached();
    await page.getByRole('button', { name: 'Proof Packet' }).click();
    await expect(page.getByRole('heading', { name: 'Judge packet' })).toBeAttached();
    await expect(page.locator('[data-proof-link="deploy-hash"]')).toBeAttached();

    const hasHorizontalScroll = await page.evaluate(() => (
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    ));
    expect(hasHorizontalScroll, `${viewport.width}px viewport should not scroll horizontally`).toBe(false);
  }
});

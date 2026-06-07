import { expect, test } from '@playwright/test';

async function panelBox(page: import('@playwright/test').Page, title: string) {
  const heading = page.getByText(title).first();
  await expect(heading).toBeVisible();
  const box = await heading.locator('xpath=ancestor::*[contains(@class, "quant-terminal")][1]').boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

test.describe('BNB cockpit layout', () => {
  const removedRibbonLabels = [
    'Mainnet',
    'Autonomous',
    'Observed',
    'Receipts',
    '1m',
    '5m',
    '15m',
    '1h',
    ['Market', 'Intel'].join(' '),
    ['Heikin', 'Signal'].join(' '),
    ['Loop', 'waiting'].join(' '),
  ];
  const removedLoopPattern = new RegExp(['loop', 'waiting'].join(' '), 'i');
  const removedCopyPatterns = [
    /\breceipts?\b/i,
    /market intelligence/i,
    /ML probability/i,
    /causal effect/i,
    /realized PnL/i,
    /MCP tools used/i,
    /agent_snapshot/i,
    /Tx Hash Log/i,
    /\bmomentum\b/i,
    /volume z/i,
    /Work order rail/i,
    /Current Work Order/i,
    /Hard blockers first/i,
    /Live preflight/i,
    /preflight snapshot/i,
    /waiting-for-policy-intent/i,
  ];

  test('uses a single autonomous quant terminal with no MCP tools column', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });

    const terminal = await panelBox(page, 'BNB/USDT');

    await expect(page.getByRole('heading', { name: 'MCP Tools' })).toHaveCount(0);
    await expect(page.getByText('Market signal').first()).toBeVisible();
    await expect(page.getByText('24h move').first()).toBeVisible();
    await expect(page.getByText('24h volume').first()).toBeVisible();
    await expect(page.getByText('Wallet-native signer')).toBeVisible();
    await expect(page.getByText('Backend agent loop')).toBeVisible();
    await expect(page.getByText('Tools used')).toBeVisible();
    await expect(page.getByText('Proof score')).toBeVisible();
    await expect(page.locator('.quant-section-title').filter({ hasText: 'Trade plan' })).toBeVisible();
    await expect(page.getByText('Blocking checks', { exact: true })).toBeVisible();
    await expect(page.getByText('Live safety check')).toBeVisible();
    await expect(page.getByText('Recovery candidates')).toBeVisible();
    await expect(page.getByText('Decision summary')).toBeVisible();
    for (const label of removedRibbonLabels) {
      await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByText(removedLoopPattern)).toHaveCount(0);
    for (const pattern of removedCopyPatterns) {
      await expect(page.getByText(pattern)).toHaveCount(0);
    }
    await expect(page.getByText('agent snapshot')).toBeVisible();
    await expect(page.getByRole('button', { name: /pause|run trade|run agent|execute/i })).toHaveCount(0);
    await expect(page.getByRole('button')).toHaveCount(0);
    expect(terminal.width).toBeGreaterThan(1100);
    const scrollMetrics = await page.evaluate(() => ({
      y: window.scrollY,
      body: document.body.scrollHeight,
      doc: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
    }));
    expect(scrollMetrics.y).toBe(0);
    expect(scrollMetrics.body).toBeGreaterThanOrEqual(scrollMetrics.viewport);
    expect(scrollMetrics.doc).toBeGreaterThanOrEqual(scrollMetrics.viewport);
    await page.mouse.wheel(0, 900);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(page.getByText('Blockchain Proof Log')).toBeVisible();
  });

  test('keeps the reasoning trace visible on the first screen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });

    await expect(page.getByText('Agent Reasoning')).toBeVisible();
    await expect(page.getByText('Decision summary')).toBeVisible();
    await expect(page.getByText(removedLoopPattern)).toHaveCount(0);
    for (const pattern of removedCopyPatterns) {
      await expect(page.getByText(pattern)).toHaveCount(0);
    }
    await expect(page.getByText('Backend agent loop')).toBeVisible();
    await expect(page.getByRole('button')).toHaveCount(0);
    await expect(page.getByText('market', { exact: true })).toBeVisible();
    await expect(page.getByText('action', { exact: true })).toBeVisible();
    await expect(page.getByText('agent snapshot')).toBeVisible();
  });
});

import { expect, test } from '@playwright/test';

async function panelBox(page: import('@playwright/test').Page, title: string) {
  const heading = page.getByText(title).first();
  await expect(heading).toBeVisible();
  const box = await heading.locator('xpath=ancestor::*[contains(@class, "quant-terminal")][1]').boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

test.describe('BNB cockpit layout', () => {
  const removedOverviewLabel = ['C', 'M', 'C overview'].join('');
  const removedResearchLabel = ['BNB Quant', 'Research Lab'].join(' ');
  const removedWorkspaceLabel = ['TradingView-style', 'workspace'].join(' ');
  const removedRibbonLabels = [
    'Mainnet',
    'Autonomous',
    'Observed',
    'Receipts',
    '1m',
    '5m',
    '15m',
    '1h',
    'Market Intel',
    'Heikin Signal',
    'Loop waiting',
  ];

  test('uses a single autonomous quant terminal with no MCP tools column', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });

    const terminal = await panelBox(page, 'BNB/USDT');

    await expect(page.getByRole('heading', { name: 'MCP Tools' })).toHaveCount(0);
    await expect(page.getByText('Market signal').first()).toBeVisible();
    await expect(page.getByText('Wallet-native signer')).toBeVisible();
    await expect(page.getByText('Market tape')).toBeVisible();
    await expect(page.getByText('Research stack')).toBeVisible();
    await expect(page.getByText('CMC Skill Brief')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run CMC' })).toBeVisible();
    await expect(page.getByText('Backend agent loop')).toBeVisible();
    await expect(page.getByText('MCP tools used')).toBeVisible();
    await expect(page.getByText('Proof score')).toBeVisible();
    await expect(page.getByText('Hard blockers first')).toBeVisible();
    await expect(page.getByText('Recovery candidates')).toBeVisible();
    await expect(page.getByText('Decision summary')).toBeVisible();
    await expect(page.getByText(removedOverviewLabel)).toHaveCount(0);
    await expect(page.getByText(removedResearchLabel)).toHaveCount(0);
    await expect(page.getByText(removedWorkspaceLabel)).toHaveCount(0);
    for (const label of removedRibbonLabels) {
      await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByText('agent_snapshot')).toBeVisible();
    await expect(page.getByRole('button', { name: /pause|run trade|run agent|execute/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refresh dashboard snapshot' })).toBeVisible();
    expect(terminal.width).toBeGreaterThan(1100);
    expect(terminal.y + terminal.height).toBeLessThanOrEqual(720);
    const scrollMetrics = await page.evaluate(() => ({
      y: window.scrollY,
      body: document.body.scrollHeight,
      doc: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
    }));
    expect(scrollMetrics.y).toBe(0);
    expect(scrollMetrics.body).toBeLessThanOrEqual(scrollMetrics.viewport + 1);
    expect(scrollMetrics.doc).toBeLessThanOrEqual(scrollMetrics.viewport + 1);
    await page.mouse.wheel(0, 900);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('keeps the reasoning trace visible on the first screen', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });

    await expect(page.getByText('Agent Reasoning')).toBeVisible();
    await expect(page.getByText('Decision summary')).toBeVisible();
    await expect(page.getByText(removedOverviewLabel)).toHaveCount(0);
    await expect(page.getByText(removedResearchLabel)).toHaveCount(0);
    await expect(page.getByText(removedWorkspaceLabel)).toHaveCount(0);
    await expect(page.getByText('Backend agent loop')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh dashboard snapshot' })).toBeVisible();
    await expect(page.getByText('market', { exact: true })).toBeVisible();
    await expect(page.getByText('action', { exact: true })).toBeVisible();
    await expect(page.getByText('agent_snapshot')).toBeVisible();
  });
});

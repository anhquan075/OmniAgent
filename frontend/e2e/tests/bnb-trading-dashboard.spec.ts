import { expect, test } from '@playwright/test';

test.describe('BNB trading dashboard', () => {
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

  test('shows BSC trading evidence on the first screen', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });

    const dashboard = page.getByText('BNB/USDT').first();
    await expect(dashboard).toBeVisible({ timeout: 15_000 });

    const box = await dashboard.boundingBox();
    expect(box?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(700);

    await expect(page.getByText('wallet').first()).toBeVisible();
    await expect(page.getByText('Market signal').first()).toBeVisible();
    await expect(page.getByText('Wallet-native signer').first()).toBeVisible();
    await expect(page.getByText('Market tape').first()).toBeVisible();
    await expect(page.getByText('Research stack').first()).toBeVisible();
    await expect(page.getByText('CMC Skill Brief').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run CMC' })).toBeVisible();
    await expect(page.getByText('ML probability').first()).toBeVisible();
    await expect(page.getByText('data quality').first()).toBeVisible();
    await expect(page.getByText('order flow').first()).toBeVisible();
    await expect(page.getByText('Work order rail').first()).toBeVisible();
    await expect(page.getByText('Proof score').first()).toBeVisible();
    await expect(page.getByText('Hard blockers first').first()).toBeVisible();
    await expect(page.getByText('Recovery candidates').first()).toBeVisible();
    await expect(page.getByText('Decision summary').first()).toBeVisible();
    await expect(page.getByText(removedOverviewLabel)).toHaveCount(0);
    await expect(page.getByText(removedResearchLabel)).toHaveCount(0);
    await expect(page.getByText(removedWorkspaceLabel)).toHaveCount(0);
    for (const label of removedRibbonLabels) {
      await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByText('Backend agent loop').first()).toBeVisible();
    await expect(page.getByText('Agent Reasoning').first()).toBeVisible();
    await expect(page.getByText('MCP tools used').first()).toBeVisible();
    await expect(page.getByText('Blockchain Tx Hash Log').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /pause|run trade|run agent|execute/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refresh dashboard snapshot' })).toBeVisible();
  });
});

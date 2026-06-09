import { expect, test } from '@playwright/test';

test.describe('BNB trading dashboard', () => {
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
    /market waiting/i,
    /Agent loop idle/i,
  ];

  test('shows BSC trading evidence on the first screen', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });

    const dashboard = page.getByText('BNB/USDT').first();
    await expect(dashboard).toBeVisible({ timeout: 15_000 });

    const box = await dashboard.boundingBox();
    expect(box?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(700);
    const signalStrip = page.locator('.quant-signal-strip');

    await expect(page.locator('.quant-operator-metrics').getByText('Wallet')).toBeVisible();
    await expect(page.getByText('Market signal').first()).toBeVisible();
    await expect(page.getByText('Wallet-native signer').first()).toBeVisible();
    await expect(signalStrip.getByText('Signal')).toBeVisible();
    await expect(page.getByText(/read-only/i).first()).toBeVisible();
    await expect(page.locator('.quant-status-band')).toBeVisible();
    await expect(page.locator('.quant-status-band')).toContainText(/Active|Live|Offline/i);
    await expect(page.locator('.quant-status-band')).toContainText(/PnL/i);
    await expect(signalStrip.getByText('Coverage')).toBeVisible();
    await expect(signalStrip.getByText('Gate')).toBeVisible();
    await expect(page.getByText('24h move').first()).toBeVisible();
    await expect(page.getByText('24h volume').first()).toBeVisible();
    await expect(page.getByText('Trade plan').first()).toBeVisible();
    await expect(page.getByText('Proof score').first()).toBeVisible();
    await expect(page.getByText('Safety checks', { exact: true })).toBeVisible();
    await expect(page.getByText('Live safety check').first()).toBeVisible();
    await expect(page.getByText('Recovery candidates').first()).toBeVisible();
    await expect(page.getByText('Decision summary').first()).toBeVisible();
    const primaryVerdict = page.getByRole('region', { name: 'Primary decision verdict' });
    await expect(primaryVerdict).toBeVisible();
    const primaryVerdictBox = await primaryVerdict.boundingBox();
    const readinessBandBox = await page.locator('.quant-operator-band').boundingBox();
    const signalStripBox = await page.locator('.quant-signal-strip').boundingBox();
    expect(primaryVerdictBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual((signalStripBox?.y ?? 0) + 1);
    expect(readinessBandBox?.y ?? 0).toBeGreaterThanOrEqual(((signalStripBox?.y ?? 0) + (signalStripBox?.height ?? 0)) - 2);
    await expect(page.locator('.reasoning-verdict-summary')).toContainText(/No trade can be sent|Agent live in safety hold|Monitoring safety gates|Ready when policy allows/);
    await expect(page.locator('body')).not.toContainText(/\b(blocked|waiting|paused)\b/i);
    for (const label of removedRibbonLabels) {
      await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByText(removedLoopPattern)).toHaveCount(0);
    for (const pattern of removedCopyPatterns) {
      await expect(page.getByText(pattern)).toHaveCount(0);
    }
    await expect(page.getByText('Backend agent loop').first()).toBeVisible();
    await expect(page.getByText('Why this verdict').first()).toBeVisible();
    await expect(page.getByText('Agent Reasoning').first()).toBeVisible();
    await expect(page.getByText('Tools used').first()).toBeVisible();
    await expect(page.getByText('Blockchain Proof Log').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /pause|run trade|run agent|execute/i })).toHaveCount(0);
    await expect(page.getByRole('button')).toHaveCount(0);
  });
});

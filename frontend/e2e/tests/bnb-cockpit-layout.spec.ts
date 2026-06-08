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
    /market waiting/i,
    /Agent loop idle/i,
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
    await expect(page.getByText('Why this verdict')).toBeVisible();
    await expect(page.getByText(/read-only/i).first()).toBeVisible();
    await expect(page.getByText('backend offline').first()).toBeVisible();
    await expect(page.getByText('API session unavailable').first()).toBeVisible();
    await expect(page.locator('.quant-status-band')).toBeVisible();
    await expect(page.getByText('Tools used')).toBeVisible();
    await expect(page.getByText('Proof score')).toBeVisible();
    await expect(page.locator('.quant-section-title').filter({ hasText: 'Trade plan' })).toBeVisible();
    await expect(page.getByText('Blocking checks', { exact: true })).toBeVisible();
    await expect(page.getByText('Live safety check')).toBeVisible();
    await expect(page.getByText('Recovery candidates')).toBeVisible();
    await expect(page.getByText('Decision summary')).toBeVisible();
    const primaryVerdict = page.getByRole('region', { name: 'Primary decision verdict' });
    await expect(primaryVerdict).toBeVisible();
    const primaryVerdictBox = await primaryVerdict.boundingBox();
    const readinessBandBox = await page.locator('.quant-operator-band').boundingBox();
    const offlineBriefBox = await page.locator('.quant-offline-brief').boundingBox();
    expect(primaryVerdictBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(readinessBandBox?.y ?? 0);
    expect(primaryVerdictBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(offlineBriefBox?.y ?? 0);
    await expect(page.locator('.reasoning-verdict-summary')).toContainText('No trade can be sent');
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
    const primaryVerdict = page.getByRole('region', { name: 'Primary decision verdict' });
    await expect(primaryVerdict).toBeVisible();
    const primaryVerdictBox = await primaryVerdict.boundingBox();
    const readinessBandBox = await page.locator('.quant-operator-band').boundingBox();
    const offlineBriefBox = await page.locator('.quant-offline-brief').boundingBox();
    expect(primaryVerdictBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(readinessBandBox?.y ?? 0);
    expect(primaryVerdictBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(offlineBriefBox?.y ?? 0);
    await expect(page.locator('.reasoning-verdict-summary')).toContainText('No trade can be sent');
    await expect(page.getByText(removedLoopPattern)).toHaveCount(0);
    for (const pattern of removedCopyPatterns) {
      await expect(page.getByText(pattern)).toHaveCount(0);
    }
    await expect(page.getByText('Backend agent loop')).toBeVisible();
    await expect(page.getByText('Why this verdict')).toBeVisible();
    await expect(page.getByRole('button')).toHaveCount(0);
    await expect(page.getByText('market', { exact: true })).toBeVisible();
    await expect(page.getByText('action', { exact: true })).toBeVisible();
    await expect(page.getByText('agent snapshot')).toBeVisible();
  });

  test('keeps mobile status compact without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });

    await expect(page.getByText(/read-only/i).first()).toBeVisible();
    await expect(page.getByText('backend offline').first()).toBeVisible();
    const signalStripLocator = page.locator('.quant-signal-strip');
    await expect(page.locator('.quant-status-band')).toBeVisible();
    await expect(signalStripLocator.getByText('backend session').first()).toBeVisible();
    const summary = await page.getByRole('region', { name: 'Primary decision verdict' }).boundingBox();
    const signalStrip = await signalStripLocator.boundingBox();
    const readinessBand = await page.locator('.quant-operator-band').boundingBox();
    const offlineBrief = await page.locator('.quant-offline-brief').boundingBox();
    const proofLoop = await page.getByText('Proof loop').first().boundingBox();
    const context = await page.getByText('Why this verdict').first().boundingBox();
    const tradePlan = await page.getByText('Trade plan').first().boundingBox();
    const readiness = await page.getByText('Hackathon readiness').first().boundingBox();
    const reasoning = await page.getByText('Agent Reasoning').first().boundingBox();
    const chainLog = await page.getByText('Blockchain Proof Log').first().boundingBox();
    expect(summary?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(signalStrip?.y ?? 0);
    expect(summary?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(readinessBand?.y ?? 0);
    expect(summary?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(offlineBrief?.y ?? 0);
    expect(context?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(980);
    expect(context?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(460);
    expect(context?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(proofLoop?.y ?? 0);
    expect(proofLoop?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(tradePlan?.y ?? 0);
    expect(summary?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(tradePlan?.y ?? 0);
    expect(summary?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(readiness?.y ?? 0);
    expect(tradePlan?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(readiness?.y ?? 0);
    expect(readiness?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(500);
    expect(readiness?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(reasoning?.y ?? 0);
    expect(readiness?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(chainLog?.y ?? 0);

    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      doc: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
    expect(overflow.doc).toBeLessThanOrEqual(overflow.viewport + 1);
  });
});

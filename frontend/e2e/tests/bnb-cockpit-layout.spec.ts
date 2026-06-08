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
    await expect(page.locator('.reasoning-verdict-summary')).toContainText('No trade can be sent'); expect(await page.locator('.agent-reasoning-panel').evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
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
    const contextBox = await page.locator('.quant-context-panel').boundingBox();
    const proofBox = await page.locator('.loop-proof-rail').boundingBox();
    expect(contextBox?.bottom ?? 0).toBeLessThanOrEqual((proofBox?.y ?? 0) + 1);
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

  test('keeps compact tablet layout contained in one viewport', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });

    await expect(page.getByText('Proof loop').first()).toBeVisible();
    await expect(page.locator('.quant-side-stack-readiness')).toBeHidden();
    await expect(page.locator('.quant-side-stack-reasoning')).toBeHidden();
    const metrics = await page.evaluate(() => ({
      y: window.scrollY,
      body: document.body.scrollHeight,
      doc: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
    }));
    expect(metrics.y).toBe(0);
    expect(metrics.body).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.doc).toBeLessThanOrEqual(metrics.viewport + 1);
    await page.mouse.wheel(0, 900);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('keeps mobile status compact without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });

    const signalStripLocator = page.locator('.quant-signal-strip');
    await expect(page.locator('.quant-status-band')).toBeVisible();
    await expect(page.locator('.quant-status-band').getByText('Offline').first()).toBeVisible();
    await expect(signalStripLocator.getByText('read-only').first()).toBeVisible();
    const visibleSignalTilesFit = await signalStripLocator.locator('.quant-signal-tile').evaluateAll(els => els.filter(el => getComputedStyle(el).display !== 'none').every(el => el.scrollHeight <= el.clientHeight + 1));
    expect(visibleSignalTilesFit).toBe(true);
    expect(await signalStripLocator.locator('.quant-signal-tile:visible').count()).toBe(3);
    expect(await page.locator('.quant-topbar > .quant-topmetric').evaluateAll(els => els.every(el => getComputedStyle(el).display === 'none'))).toBe(true);
    const summary = await page.getByRole('region', { name: 'Primary decision verdict' }).boundingBox();
    const signalStrip = await signalStripLocator.boundingBox();
    const readinessBand = await page.locator('.quant-operator-band').boundingBox();
    const proofLoop = await page.getByText('Proof loop').first().boundingBox();
    const proofLoopFits = await page.locator('.loop-proof-rail').evaluate(rail => Array.from(rail.querySelectorAll('*')).every(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1));
    expect(proofLoopFits).toBe(true);
    const context = await page.getByText('Why this verdict').first().boundingBox();
    const tradePlan = await page.getByText('Trade plan').first().boundingBox();
    const terminal = await page.locator('.quant-terminal').boundingBox();
    expect(summary?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(signalStrip?.y ?? 0);
    expect(summary?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(readinessBand?.y ?? 0);
    expect(terminal?.height ?? 0).toBeLessThanOrEqual(1001);
    expect(context?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(1000);
    expect(context?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(210);
    expect(context?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(proofLoop?.y ?? 0);
    expect(proofLoop?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(tradePlan?.y ?? 0);
    expect(summary?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(tradePlan?.y ?? 0);
    await expect(page.locator('.quant-side-stack-readiness')).toBeHidden();
    await expect(page.locator('.quant-side-stack-reasoning')).toBeHidden();

    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      doc: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      bodyHeight: document.body.scrollHeight,
      docHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }));
    expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
    expect(overflow.doc).toBeLessThanOrEqual(overflow.viewport + 1);
    expect(overflow.bodyHeight).toBeLessThanOrEqual(overflow.viewportHeight + 1);
    expect(overflow.docHeight).toBeLessThanOrEqual(overflow.viewportHeight + 1);
    await page.mouse.wheel(0, 900);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });
});

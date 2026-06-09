import { expect, test } from '@playwright/test';

test.describe('BNB cockpit small mobile layout', () => {
  test('keeps the 360px cockpit readable with vertical scroll and no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(700);

    await expect(page.getByText('BNB/USDT').first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Primary decision verdict' })).toBeVisible();
    await expect(page.getByText('Why this verdict').first()).toBeVisible();
    await expect(page.getByText('BNB Agent Runtime').first()).toBeVisible();
    await expect(page.getByText('Replay Risk Report').first()).toBeVisible();
    await expect(page.getByText('Proof loop').first()).toBeVisible();
    await expect(page.locator('.loop-proof-step:visible')).toHaveCount(3);
    await expect(page.getByText('Trade plan').first()).toBeVisible();

    const metrics = await page.evaluate(() => {
      const selectors = [
        '.quant-terminal',
        '.quant-status-band',
        '.quant-context-panel',
        '.loop-proof-rail',
        '.quant-workrail',
      ];
      return {
        bodyHeight: document.body.scrollHeight,
        docHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        bodyWidth: document.body.scrollWidth,
        docWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        clipped: selectors.filter((selector) => {
          const el = document.querySelector(selector);
          return el ? el.scrollWidth > el.clientWidth + 1 : false;
        }),
      };
    });

    expect(metrics.bodyHeight).toBeGreaterThan(metrics.viewportHeight);
    expect(metrics.docHeight).toBeGreaterThan(metrics.viewportHeight);
    expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(metrics.docWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(metrics.clipped).toEqual([]);

    await page.mouse.wheel(0, 900);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect(page.getByText('Agent Reasoning').first()).toBeVisible();
    await expect(page.getByText('Blockchain Proof Log').first()).toBeVisible();
    await expect(page.getByText('Backend Execution').first()).toBeVisible();
  });
});

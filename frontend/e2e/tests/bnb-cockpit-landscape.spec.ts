import { expect, test } from '@playwright/test';

test.describe('BNB cockpit landscape layout', () => {
  test('keeps the compact landscape cockpit responsive without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 932, height: 430 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(700);

    await expect(page.getByText('BNB/USDT').first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Primary decision verdict' })).toBeVisible();
    await expect(page.locator('.quant-status-band')).toBeVisible();
    await expect(page.getByText('Why this verdict').first()).toBeVisible();
    await expect(page.getByText('Proof loop').first()).toBeVisible();
    await expect(page.getByText('Trade plan').first()).toBeVisible();
    await expect(page.locator('.loop-proof-step:visible')).toHaveCount(3);

    const metrics = await page.evaluate(() => {
      const selectors = [
        '.quant-terminal',
        '.quant-status-band',
        '.quant-primary-verdict',
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
  });
});

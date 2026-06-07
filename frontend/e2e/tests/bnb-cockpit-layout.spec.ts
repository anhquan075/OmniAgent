import { expect, test } from '@playwright/test';

async function cardBox(page: import('@playwright/test').Page, title: string) {
  const heading = page.getByRole('heading', { name: title }).first();
  await expect(heading).toBeVisible();
  const box = await heading.locator('xpath=ancestor::section[1]').boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

test.describe('BNB cockpit layout', () => {
  test('uses a single BNB trading agent panel with no MCP tools column', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });

    const agent = await cardBox(page, 'BNB Trading Agent');

    await expect(page.getByRole('heading', { name: 'MCP Tools' })).toHaveCount(0);
    await expect(page.getByText('MCP tools used')).toBeVisible();
    await expect(page.getByText('Proof score')).toBeVisible();
    await expect(page.getByText('Hard blockers first')).toBeVisible();
    await expect(page.getByText('Recovery candidates')).toBeVisible();
    await expect(page.getByText('bnb_agent_cockpit_snapshot')).toBeVisible();
    expect(agent.width).toBeGreaterThan(1100);
    expect(agent.y + agent.height).toBeLessThanOrEqual(720);
    await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
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
    await expect(page.getByText('market', { exact: true })).toBeVisible();
    await expect(page.getByText('action', { exact: true })).toBeVisible();
    await expect(page.getByText('bnb_agent_cockpit_snapshot')).toBeVisible();
  });
});

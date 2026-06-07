import { expect, test } from '@playwright/test';

test.describe('BNB trading dashboard', () => {
  test('shows BSC trading evidence on the first screen', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });

    const dashboard = page.getByText('BNB Trading Agent').first();
    await expect(dashboard).toBeVisible({ timeout: 15_000 });

    const box = await dashboard.boundingBox();
    expect(box?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(700);

    await expect(page.getByText('wallet').first()).toBeVisible();
    await expect(page.getByText('Autonomous core').first()).toBeVisible();
    await expect(page.getByText('TWAK').first()).toBeVisible();
    await expect(page.getByText('trades').first()).toBeVisible();
    await expect(page.getByText('x402').first()).toBeVisible();
    await expect(page.getByText('Work order rail').first()).toBeVisible();
    await expect(page.getByText('Proof score').first()).toBeVisible();
    await expect(page.getByText('Hard blockers first').first()).toBeVisible();
    await expect(page.getByText('Recovery candidates').first()).toBeVisible();
    await expect(page.getByText('Proof report').first()).toBeVisible();
    await expect(page.getByText('Agent Reasoning').first()).toBeVisible();
    await expect(page.getByText('MCP tools used').first()).toBeVisible();
    await expect(page.getByText('Blockchain Tx Hash Log').first()).toBeVisible();
  });
});

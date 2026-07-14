import { expect, test } from '@playwright/test';

test('operator can run the Casper dashboard flow without scripts', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Casper proof console' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run Casper cycle' })).toBeVisible();

  const cycleResponse = page.waitForResponse(response => (
    response.url().includes('/api/cycle/run') && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: 'Run Casper cycle' }).click();
  const cycle = await cycleResponse;
  const decisionId = String(cycle.request().postDataJSON()?.decisionId ?? '');

  expect(cycle.status()).toBe(200);
  expect(decisionId).toMatch(/^dashboard-\d+$/);
  expect(cycle.request().postDataJSON()?.submit).toBe(true);
  expect(cycle.request().postDataJSON()?.iUnderstandThisSubmitsCasperTestnet).toBe(true);
  await expect(page.getByText('cycle requested')).toBeVisible();
  await expect(page.getByText(decisionId).first()).toBeVisible();

  const verifyResponse = page.waitForResponse(response => (
    response.url().includes('/api/mcp') && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: 'Proof Packet' }).click();
  await page.getByRole('button', { name: 'Verify receipt' }).click();
  const verify = await verifyResponse;
  const verifyRequest = verify.request().postDataJSON();

  expect(verify.status()).toBe(200);
  expect(verifyRequest.params.name).toBe('casper_verify_decision_receipt');
  expect(verifyRequest.params.arguments.decisionId).toBe(decisionId);
  await expect(page.locator('[data-verify-status]')).toContainText(/chain verified|local verified|mismatch/);

  await page.getByRole('button', { name: 'Cockpit' }).click();
  const startResponse = page.waitForResponse(response => (
    response.url().includes('/api/loop/start') && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: 'Start Casper loop' }).click();
  const start = await startResponse;

  expect(start.status()).toBe(200);
  expect(new URL(start.url()).searchParams.get('dry_run')).toBe('false');
  await expect(page.getByText('loop started')).toBeVisible();
  await expect(page.locator('.loop-badge.is-running')).toBeVisible();

  const stopResponse = page.waitForResponse(response => (
    response.url().includes('/api/loop/stop') && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: 'Stop Casper loop' }).click();
  const stop = await stopResponse;

  expect(stop.status()).toBe(200);
  await expect(page.getByText('loop stopped')).toBeVisible();
  await expect(page.locator('.loop-badge.is-stopped')).toBeVisible();
});

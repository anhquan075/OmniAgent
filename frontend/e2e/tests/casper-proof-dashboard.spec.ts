import { expect, test } from '@playwright/test';

import { linkedSnapshot } from '../fixtures/casper-dashboard-snapshot';

test('dashboard shows Casper proof surface', async ({ page }) => {
  const snapshotResponse = page.waitForResponse(response => (
    response.url().includes('/api/dashboard/snapshot') && response.status() === 200
  ));
  await page.goto('/');
  const snapshot = await (await snapshotResponse).json();
  const account = snapshot.casperAgentRuntime.account ?? {};
  const signalStrip = page.getByLabel('Casper runtime signals');

  expect(snapshot.network).toBe('casper');
  expect(snapshot.casperAgentRuntime.network).toBe('casper');
  await expect(page.getByAltText('Casper network')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Casper proof console' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'OmniAgent receipt console' })).toBeVisible();
  await expect(page.getByText('Casper Testnet')).toBeVisible();
  await expect(page.getByText('Decision receipt proof')).toBeVisible();
  await expect(page.getByText('Judge packet')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Autonomous loop' })).toBeVisible();
  await expect(page.getByAltText('Casper autonomous agent mascot')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'MCP activity log' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI output' })).toBeVisible();
  await expect(page.getByText('Replay command')).toBeVisible();
  await expect(page.getByText('Receipt digest', { exact: true })).toBeVisible();
  await expect(page.getByText('Account').first()).toBeVisible();
  await expect(signalStrip).toContainText(account.configured ? 'configured' : 'missing');
  await expect(signalStrip).toContainText(account.contract?.hash ? 'configured' : 'missing');
  await expect(page.getByText('Casper explorer')).toBeVisible();
  await expect(page.getByText(/local fallback:/)).toHaveCount(0);
  await expect(page.getByText(['AI decision', 'agent'].join(' '))).toHaveCount(0);
  await expect(page.getByText(new RegExp(['Senti', 'nel'].join('')))).toHaveCount(0);
});

test('dashboard embeds explorer links for proof values', async ({ page }) => {
  await page.route('**/api/dashboard/snapshot?limit=8', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(linkedSnapshot),
  }));
  await page.route('**/api/dashboard/receipts**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      network: 'casper',
      receipts: [
        { decisionId: 'rwa-collateral-demo-001', action: 'approve', riskScore: 22, timestamp: '2026-07-03T10:00:00+00:00' },
        {
          decisionId: 'casper-live-20260702-receipt-001',
          action: 'haircut',
          riskScore: 72,
          timestamp: '2026-07-02T14:44:03+00:00',
          deployHash: 'ddef65a6',
          proofDigest: 'sha256:95c27f7aeffaf7f994b8edc824547a8f9142d5c8159368f020912627eac6158f',
          policyGate: 'approved',
          eventType: 'casper_decision_submitted',
        },
      ],
      count: 2,
    }),
  }));

  await page.goto('/');

  const deployUrl = 'https://testnet.cspr.live/deploy/ddef65a6d533eecd4c4721a3cb8792c73bb483e2068a03b5a2d86022828a9736';
  await expect(page.getByRole('link', { name: 'Open deploy proof on Casper explorer' })).toHaveAttribute('href', deployUrl);
  await expect(page.locator('[data-proof-link="decision-id"]')).toHaveAttribute('href', deployUrl);
  await expect(page.locator('[data-proof-link="deploy"]')).toHaveAttribute('href', deployUrl);
  await expect(page.locator('[data-proof-link="account"]')).toHaveAttribute('href', /\/account\/0203a586/);
  await expect(page.locator('[data-proof-link="contract"]')).toHaveAttribute('href', /\/contract\/5a82529f/);
  await expect(page.locator('[data-proof-link="package"]')).toHaveAttribute('href', /\/contract-package\/46cf5754/);
  await expect(page.locator('[data-proof-link="decision-id"]')).toHaveAttribute('aria-label', 'Open decision receipt deploy proof on Casper explorer');
  await expect(page.getByRole('link', { name: 'Open deploy proof on Casper explorer' })).toHaveAttribute('aria-label', 'Open deploy proof on Casper explorer');
  await expect(page.getByRole('button', { name: 'Copy replay command' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy receipt digest' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify receipt' })).toBeVisible();
  await expect(page.locator('.judge-actions .copy-status')).toBeAttached();
  await expect(page.getByText('Evidence summary')).toBeVisible();
  await expect(page.locator('[data-evidence-field="scenario"]')).toBeVisible();
  await expect(page.locator('[data-evidence-field="source"] a')).toHaveAttribute('href', 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates');
  await expect(page.getByText('Decision log')).toBeVisible();
  await expect(page.locator('[data-page-decision-log]')).toBeVisible();
  await expect(page.getByText('rwa-collateral-demo-001')).toBeVisible();
  await expect(page.getByText('Decision submitted')).toBeVisible();
  await expect(page.locator('[data-page-decision-log] .chain-proof-link')).toBeVisible();
  await expect(page.getByLabel('Casper contract links')).toBeVisible();
  await expect(page.getByText('Agent loop')).toBeVisible();
  await expect(page.locator('[data-loop-status]')).toBeVisible();
  await expect(page.locator('.loop-badge.is-running')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run Casper cycle' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop Casper loop' })).toBeVisible();
});

test('dashboard renders MCP calls and AI role output from the proof bundle', async ({ page }) => {
  await page.route('**/api/dashboard/snapshot?limit=8', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(linkedSnapshot),
  }));

  await page.goto('/');

  await expect(page.getByText('casper_rwa_evidence')).toBeVisible();
  await expect(page.getByText('casper_guardrails')).toBeVisible();
  await expect(page.getByText('casper_record_readback')).toBeVisible();
  await expect(page.getByText('Treasury collateral yield crossed the policy band')).toBeVisible();
  await expect(page.getByLabel('AI output').getByText('proposer')).toBeVisible();
  await expect(page.getByLabel('AI output').getByText('policy gate')).toBeVisible();
});

test('dashboard shows pending proof links when hashes are missing', async ({ page }) => {
  await page.route('**/api/dashboard/snapshot?limit=8', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ...linkedSnapshot,
      casperProofBundle: {
        ...linkedSnapshot.casperProofBundle,
        status: 'blocked',
        deployStatus: { status: 'not_submitted' },
        readback: { verified: false, status: 'missing' },
        lifecycle: [{ state: 'submit', status: 'not_submitted' }],
      },
    }),
  }));

  await page.goto('/');

  await expect(page.locator('.chain-proof-missing').first()).toHaveText('pending');
  await expect(page.getByLabel('Autonomous decision cycle').getByText('not submitted')).toBeVisible();
  await expect(page.locator('[data-proof-link="deploy"]')).toHaveCount(0);
});

test('dashboard stays responsive across judge viewports', async ({ page }) => {
  await page.route('**/api/dashboard/snapshot?limit=8', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(linkedSnapshot),
  }));
  await page.route('**/api/dashboard/receipts**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ network: 'casper', receipts: [], count: 0 }),
  }));
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { animation: none !important; }';
    document.documentElement.appendChild(style);
  });

  for (const viewport of [
    { width: 320, height: 720 },
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');

    await expect(page.getByAltText('Casper network')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'OmniAgent receipt console' })).toBeAttached();
    await expect(page.getByAltText('Casper autonomous agent mascot')).toBeAttached();
    await expect(page.getByRole('heading', { name: 'MCP activity log' })).toBeAttached();
    await expect(page.getByText('Judge packet')).toBeAttached();
    await expect(page.locator('[data-proof-link="deploy"]')).toBeAttached();

    const hasHorizontalScroll = await page.evaluate(() => (
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    ));
    expect(hasHorizontalScroll, `${viewport.width}px viewport should not scroll horizontally`).toBe(false);
  }
});

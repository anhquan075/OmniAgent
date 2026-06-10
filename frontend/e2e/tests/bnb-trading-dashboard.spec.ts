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
    /Intent created/i,
    /live safety gate/i,
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
    await expect(page.getByText('BNB Agent Runtime').first()).toBeVisible();
    await expect(page.getByText('Replay Risk Report').first()).toBeVisible();
    await expect(page.locator('.quant-status-band')).toBeVisible();
    await expect(page.locator('.quant-status-band')).toContainText(/Active|Live|Offline/i);
    await expect(page.locator('.quant-status-band')).toContainText(/PnL/i);
    await expect(signalStrip.getByText('Coverage')).toBeVisible();
    await expect(signalStrip.getByText('Gate')).toBeVisible();
    await expect(page.getByText('24h move').first()).toBeVisible();
    await expect(page.getByText('24h volume').first()).toBeVisible();
    await expect(page.getByText('Trade plan').first()).toBeVisible();
    await expect(page.getByText('Proof score').first()).toBeVisible();
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
    await expect(page.getByText('Autonomous loop').first()).toBeVisible();
    await expect(page.locator('.autonomous-loop-pulse').first()).toBeVisible();
    await expect(page.getByText('Why this verdict').first()).toBeVisible();
    await expect(page.getByText('Agent Reasoning').first()).toBeVisible();
    await expect(page.getByText('Ledger Memory').first()).toBeVisible();
    await expect(page.getByText('Tools used').first()).toBeVisible();
    await expect(page.getByText('Blockchain Proof Log').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /pause|run trade|run agent|execute/i })).toHaveCount(0);
    await expect(page.getByRole('button')).toHaveCount(0);
  });

  test('renders mocked runtime memory, advisory, and report panels', async ({ page }) => {
    await routeMockedRuntime(page);

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });

    await expect(page.getByText('BNB Agent Runtime').first()).toBeVisible();
    await expect(page.getByText('Core live').first()).toBeVisible();
    await expect(page.getByText('BNBAgent').first()).toBeVisible();
    await expect(page.getByText('erc8004+erc8183').first()).toBeVisible();
    await expect(page.getByText('Replay Risk Report').first()).toBeVisible();
    await expect(page.getByText('Ledger Memory').first()).toBeVisible();
    await expect(page.locator('.reasoning-advisory-card')).toHaveCount(4);

    const cmcProof = page.locator('.proof-check-detail').filter({ hasText: 'CMC Signal Verified' });
    await expect(cmcProof).toHaveCount(1);
    await cmcProof.locator('summary').click();
    await expect(cmcProof).toHaveAttribute('open', '');
    await expect(cmcProof).toContainText('CMC MCP endpoint');
    await expect(cmcProof.locator('a[href="https://mcp.coinmarketcap.com/mcp"]')).toHaveCount(1);
    await expect(page.locator('.loop-proof-link')).not.toHaveCount(0);

    const bullCard = page.locator('.reasoning-advisory-card').filter({ hasText: 'bull' });
    await expect(bullCard).toHaveCount(1);
    await bullCard.locator('summary').click();
    await expect(bullCard).toHaveAttribute('open', '');
    await expect(bullCard).toContainText('Can execute');

    const toolSummary = page.locator('.reasoning-tools-block summary.reasoning-tool-chip').filter({ hasText: 'trending crypto narratives' });
    await expect(toolSummary).toHaveCount(1);
    await toolSummary.click();
    const openToolDetail = page.locator('.reasoning-tools-block details.reasoning-tool-detail[open]');
    await expect(openToolDetail).toHaveCount(1);
    await expect(openToolDetail).toContainText('Live CMC Agent Hub signal');
  });

  test('keeps Signal MCP and runtime cards from overlapping', async ({ page }) => {
    await page.setViewportSize({ width: 1306, height: 1324 });
    await routeMockedRuntime(page);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });

    await expect(page.getByText('Signal MCP')).toBeVisible();
    const metrics = await page.evaluate(() => {
      const rect = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const box = el.getBoundingClientRect();
        return { top: box.top, right: box.right, bottom: box.bottom, left: box.left };
      };
      const overlap = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => {
        if (!a || !b) return 0;
        return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
          * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      };
      return {
        autonomousLoopOutside: Math.max(0, (rect('.autonomous-loop-pulse')?.right ?? 0) - (rect('.quant-context-panel')?.right ?? 0)),
        autonomousLoopRuntime: overlap(rect('.autonomous-loop-pulse'), rect('.bnb-runtime-panel')),
        signalMcpExecution: overlap(rect('.market-signal-proof'), rect('.quant-execution-stack')),
        reasoningExecution: overlap(rect('.agent-reasoning-panel'), rect('.quant-execution-stack')),
        horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      };
    });
    expect(metrics.autonomousLoopOutside).toBeLessThanOrEqual(1);
    expect(metrics.autonomousLoopRuntime).toBe(0);
    expect(metrics.signalMcpExecution).toBe(0);
    expect(metrics.reasoningExecution).toBe(0);
    expect(metrics.horizontalOverflow).toBe(0);
  });
});

async function routeMockedRuntime(page: import('@playwright/test').Page) {
  await page.route('**/api/session', async route => {
    await route.fulfill({
      json: { csrfToken: 'test-csrf' },
      headers: { 'Set-Cookie': 'omniagent_session=test; Path=/; SameSite=Lax' },
    });
  });
  await page.route('**/api/dashboard/trades?**', async route => {
    await route.fulfill({ json: { status: 'ok', trades: [] } });
  });
  await page.route('**/api/dashboard/snapshot?**', async route => {
    await route.fulfill({ json: mockedRuntimeSnapshot() });
  });
}

function mockedRuntimeSnapshot() {
  const txHash = '0xf74c8940be5d26767f97aa1bfac45653cb2d3ac89d41d250645479be97db8d52';
  const cmcAgentHubSignal = {
    ready: true,
    serverVerified: true,
    toolName: 'trending crypto narratives',
    endpoint: 'https://mcp.coinmarketcap.com/mcp',
    resolution: 'auto discovered',
    timestamp: '2026-06-09T17:40:25.463822+00:00',
    parsedContent: {
      evidence: 'https://coinmarketcap.com/view/binance-ecosystem/',
    },
  };
  const proofScore = {
    score: 6,
    maxScore: 8,
    status: 'guarded',
    hardBlocked: true,
    hardBlockers: ['funded_route'],
    checks: { riskPolicyApproved: true },
  };
  const strategyResearch = {
    mode: 'advisory_only',
    canExecute: false,
    panels: [
      { role: 'bull', stance: 'watchful', confidence: 0.42, evidence: ['CMC market feed is available.'] },
      { role: 'bear', stance: 'defensive', confidence: 0.72, evidence: ['funded route missing'] },
      { role: 'risk', stance: 'policy-gated', confidence: 0.86, evidence: ['TWAK executor ready.'] },
      { role: 'arbiter', stance: 'observe', confidence: 0.55, evidence: ['Backend policy controls execution.'] },
    ],
  };
  const ledgerMemory = {
    latestDecision: { action: 'observe', status: 'guarded', reason: 'funded route missing' },
    whyTrade: ['market feed live'],
    whyNoTrade: ['funded route missing'],
    memoryLayers: {
      episodic: [{ eventType: 'trade_guarded', summary: 'policy hold' }],
    },
  };
  return {
    wallet: { walletAddress: '0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25' },
    twakStatus: { ready: true },
    prices: { configured: true, reachable: true, symbols: { BNB: { priceUsd: 587, percentChange24h: -2.8, volume24h: 1200000000 } } },
    ledger: { events: [], control: {}, dailyCompliance: { progress: '0/7' }, pnl: { totalReturnPct: 0, maxDrawdownPct: 0, registrationPeriod: { totalReturnPct: 0 } } },
    workOrders: { proofScore, workOrders: [] },
    cycle: { cmcAgentHubSignal, toolsUsed: ['trending crypto narratives', 'chain trade'] },
    liveProofBundle: {
      proofScore,
      latestReceiptStatus: { txHash, status: 'confirmed', proof: { valid: true } },
      txEvents: [{ txHash }],
      recoveryCandidates: [],
    },
    livePreflight: {
      readyForLiveTrade: false,
      cmcAgentHubSignal,
      fundedStrategy: { symbol: 'BNB', side: 'buy', amountUsd: 25, slippageBps: 50 },
      blockers: [{ name: 'funded_route', reason: 'funded route missing' }],
    },
    backendHealth: { autonomousLoopEnabled: true, autonomousLoop: { enabled: true, execute: false, phase: 'monitoring' } },
    bnbAgentRuntime: {
      sdkRole: 'runtime_core',
      executor: 'twak',
      sdkExecutesTrades: false,
      sdkRuntime: {
        facade: 'BNBAgent',
        facadeInitialized: true,
        usesOfficialFacade: true,
        modulesInitialized: ['erc8004', 'erc8183'],
        commerceServer: { mounted: false, fundedJobPolling: false },
      },
      sdkStatus: { ready: true, registryAddress: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' },
      agentProfile: {
        walletAddress: '0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25',
        agentUriPreview: 'data:application/json;base64,test',
        capabilities: [
          { name: 'bnbagent_facade', ready: true },
          { name: 'erc8004_identity', ready: true },
          { name: 'erc8183_protocol', ready: true },
          { name: 'ledger_memory', ready: true },
          { name: 'cmc_signal', ready: true },
          { name: 'twak_execution', ready: true },
        ],
      },
      identityRegistration: { ready: false, reason: 'registration is operator gated' },
      strategyResearch,
    },
    ledgerMemory,
    strategyResearch,
    backtestRiskReport: {
      source: 'ledger-replay',
      dryRunSummary: { cycles: 1, submittedTrades: 0, confirmedTrades: 0, blockedTrades: 1 },
      pnlSummary: { totalReturnPct: 0, maxDrawdownPct: 0, registrationPeriod: { totalReturnPct: 0, maxDrawdownPct: 0 } },
      riskSummary: { proofCoverage: '6/8', hardBlockers: ['funded_route'] },
    },
  };
}

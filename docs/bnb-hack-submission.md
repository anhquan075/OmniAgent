# BNB Hack Submission

## Track

Track 1: Autonomous Trading Agents.

OmniAgent is positioned as a BSC mainnet trading agent that reads CMC market context, converts those signals into bounded spot-trade intents, checks deterministic guardrails, routes through PancakeSwap, and submits only through a Trust Wallet Agent Kit execution adapter.

The dashboard now uses a Legwork-inspired proof lifecycle, not a marketplace: CMC signal -> trade work order -> risk check -> router quote -> TWAK-signed BSC transaction -> receipt proof -> scorecard -> recovery/report. The lifecycle is judge-readable evidence only; it does not relax live execution gates.

## Sponsor Usage

- BNB Chain: all network config is pinned to BSC mainnet, chain id `56`, with competition contract proof stored in the ledger.
- CoinMarketCap: `cmc_get_price_snapshot` feeds the strategy loop and risk gate.
- Trust Wallet: `bnb_get_wallet`, `bnb_trust_wallet_status`, `bnb_simulate_trade`, `bnb_competition_register`, and `bnb_execute_trade` use the TWAK execution path. Live execution requires TWAK REST wallet validation and fails closed by default.
- BNB AI Agent SDK: `bnb_agent_sdk_status` and `bnb_agent_sdk_register_identity` capture installed SDK status and ERC-8004 identity registration evidence.
- PancakeSwap: the autonomous loop builds BSC PancakeSwap V2 route calldata for allowlisted assets after CMC signal and risk approval.

## Safety Model

- Token universe is limited to BSC allowlisted symbols.
- Router target is pinned to the PancakeSwap V2 BSC mainnet router.
- `bnb_execute_trade` requires a policy-approved `TradeIntent` from the ledger.
- `bnb_execute_trade` is callable only through the guarded MCP contract and remains blocked unless every live flag and proof precondition passes.
- Proof scorecards are explanatory only. Hard blockers such as missing CMC proof, missing competition proof, TWAK mismatch, wrong wallet/router, pending receipt, failed receipt, or emergency pause remain blocking even when partial score fields are true.
- Duplicate proof digests prevent repeated tx/proof evidence from inflating confirmed daily trade counts.
- Live execution requires `BNB_TRADING_ENABLED=true`.
- Live execution requires stored competition registration proof for the same TWAK wallet.
- TWAK readiness requires execution-capable REST bridge config.
- x402 readiness is shown through `bnb_paid_resource_status`; live demos must distinguish configured readiness from verified paid receipts.
- Trade submission writes the tx hash before receipt polling.
- Receipt polling and transaction validation append terminal `trade_receipt_confirmed` only when the BSC proof is verified; wrong wallet/router/token-path hashes are blocked.
- `bnb_emergency_pause` persists a local pause state.

## Setup

Backend:

```bash
rtk uv sync --project backend --group dev
cd backend
BNB_TRADING_ENABLED=false ALLOW_AGENT_RUN=false .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend:

```bash
rtk pnpm -C frontend install
rtk pnpm -C frontend run dev
```

Required production secrets are not committed. Configure them only in private env files or deployment secrets:

- `CMC_AGENT_HUB_API_KEY`
- `CMC_SKILL_HUB_API_KEY`
- `TW_ACCESS_ID`
- `TW_HMAC_SECRET`
- `TRUST_WALLET_AGENT_KIT_CONFIG`
- `BNB_AGENT_SDK_ENABLED`
- `BNB_AGENT_SDK_REGISTRATION_ENABLED`
- `BNB_COMPETITION_REGISTRATION_ENABLED`
- `BNB_TRADING_ENABLED`
- `ALLOW_AGENT_RUN`
- `ROBOT_FLEET_X402_ENABLED`
- `X402_FACILITATOR_URL`
- `X402_PAYMENT_VERIFIER_URL`

## Demo Evidence

Final live proof report: `plans/reports/final-bnb-hack-live-proof-20260607.md`.

- Competition registration tx: `0xc9e4e4ca69156d20da4f8b5f343ee1354dfac72c40363d8e6d32b51f712c3cf4`
- Registration explorer: `https://bscscan.com/tx/0xc9e4e4ca69156d20da4f8b5f343ee1354dfac72c40363d8e6d32b51f712c3cf4`
- First TWAK-signed BSC trade tx: `0x6a1ab4dd0275f0e51756bdb6b18c7805b0e022a95c8c8f70707b09cf839063f9`
- Trade explorer: `https://bscscan.com/tx/0x6a1ab4dd0275f0e51756bdb6b18c7805b0e022a95c8c8f70707b09cf839063f9`
- Receipt proof: `confirmed`, `success=true`, `proof.valid=true`, block `102780454`
- CMC Agent Hub signal: `trending_crypto_narratives`, server verified at `2026-06-07T05:02:48.162519+00:00`
- Ledger anchors: `competition_registered`, `trade_executed`, `trade_receipt_confirmed`, and post-run `emergency_pause`

Use the one-screen BNB Trading Agent dashboard:

- BNB Trading Agent: wallet readiness, SDK identity proof, competition registration proof, CMC token context, risk decision, quote, simulation, verified tx proof, PnL, drawdown, daily trade state, emergency pause.
- Agent reasoning: live CMC/TWAK/BNB SDK tool trace, guardrail decision, execution readiness, and hold/execute rationale.
- Chain evidence: BSC transaction hashes, receipt proof, ledger summary, recovery candidates, and emergency-pause state.
- Proof lifecycle: blocker-first proof score, duplicate digest, read-only recovery candidates, and copyable report summary for judges.
- Live runbook: follow `docs/bnb-hack-live-trading-runbook.md` for registration, funding, daily trade compliance, pause/recovery, and evidence export.

## Verification

```bash
(cd backend && .venv/bin/python -m pytest -q)
(cd backend && .venv/bin/python -m compileall -q app tests scripts)
scripts/verify-legwork-mechanism-fit.sh
(cd frontend && rtk pnpm run build)
(cd frontend && rtk pnpm exec vitest run)
(cd frontend && rtk pnpm exec playwright test e2e/tests/bnb-mcp-api.spec.ts e2e/tests/bnb-cockpit-layout.spec.ts e2e/tests/bnb-trading-dashboard.spec.ts --project=chromium)
```

Live registration and trading should only be performed with a funded competition wallet after confirming the official competition contract, SDK bridge, TWAK bridge config, and emergency-pause path.

# OmniAgent

OmniAgent is a BSC mainnet autonomous trading-agent workspace for BNB Hack Track 1: Autonomous Trading Agents.

The current implementation path is intentionally narrow:

- BSC mainnet is the only active chain target.
- The demo surface is the BNB Trading Agent dashboard, not a chat app or Track 2 strategy skill.
- Browser MCP access exposes only CMC/BNB/TWAK status, guardrail, simulation, registration, ledger, recovery, and emergency-pause tools.
- The proof layer uses a Legwork-inspired lifecycle for trade work orders, blocker-first proof score, duplicate digest, read-only recovery candidates, and judge report summary. It does not add a marketplace, escrow custody, or physical-task workflow.
- Live trade submission is not browser-exposed; it must pass the autonomous policy ledger and execute through Trust Wallet Agent Kit.
- CMC Agent Hub and Trust Wallet Agent Kit configuration are isolated behind explicit env fields.
- BNB AI Agent SDK identity and BSC competition registration evidence are captured in the agent passport.
- Browser wallet providers are not part of the active cockpit; execution is through the TWAK agent wallet.
- Live trading is disabled by default and must be enabled with `BNB_TRADING_ENABLED=true`.
- Secrets are not committed; use local `.env` files for RPC keys, API keys, and private keys.

## Active Network

| Item | Value |
|------|-------|
| Chain | BNB Smart Chain mainnet |
| Chain ID | `56` |
| Explorer | `https://bscscan.com` |
| Venue MVP | PancakeSwap spot |
| Token MVP | BNB, WBNB, USDT, USDC, CAKE, TWT |

## Setup

```bash
pnpm install
rtk uv sync --project backend --group dev
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill the BSC, CMC, Trust Wallet Agent Kit, and x402 values in private env files or deployment secrets. For CMC, the backend calls the official Agent Hub MCP endpoint at `https://mcp.coinmarketcap.com/mcp` and the Skill Hub Streamable HTTP endpoint at `https://mcp.coinmarketcap.com/skill-hub/stream`. Agent Hub accepts `CMC_AGENT_HUB_API_KEY`, `CMC_MCP_API_KEY`, `CMC_PRO_API_KEY`, `COINMARKETCAP_API_KEY`, or `X_CMC_PRO_API_KEY`; Skill Hub accepts `CMC_SKILL_HUB_API_KEY`, with `CMC_MCP_API_KEY` or `CMC_AGENT_HUB_API_KEY` as fallbacks. The backend auto-discovers a signal-like CMC Agent Hub tool when a key is present; optionally pin `CMC_AGENT_HUB_SIGNAL_TOOL` plus JSON `CMC_AGENT_HUB_SIGNAL_ARGS`. Live preflight requires a concrete CMC Agent Hub MCP tool call before any real BSC trade can be submitted.

Start the local Trust Wallet Agent Kit REST bridge before FastAPI:

```bash
twak serve --rest --host localhost --port 8787
```

To configure local live env values without printing secrets, export one CMC key in the shell and run:

```bash
rtk uv --project backend run python backend/scripts/configure-bnb-live-env.py --enable-live
```

## Backend

```bash
BNB_TRADING_ENABLED=false ALLOW_AGENT_RUN=false rtk uv --project backend run python -m uvicorn app.main:app --host localhost --port 8000
```

The active backend is `backend/`; the older TypeScript backend has been removed from the current demo runtime.

The frontend-visible MCP allowlist is intentionally narrow:

- `bnb_agent_cockpit_snapshot`
- `bnb_get_wallet`
- `bnb_trust_wallet_status`
- `bnb_agent_sdk_status`
- `bnb_agent_sdk_register_identity`
- `bnb_paid_resource_status`
- `bnb_record_paid_signal_access`
- `cmc_agent_hub_status`
- `cmc_agent_hub_call_tool`
- `cmc_skill_hub_status`
- `cmc_skill_hub_find_skill`
- `cmc_skill_hub_execute_skill`
- `cmc_get_price_snapshot`
- `bnb_trade_ledger_summary`
- `bnb_quote_trade`
- `bnb_risk_check`
- `bnb_simulate_trade`
- `bnb_run_autonomous_cycle`
- `bnb_live_preflight`
- `bnb_live_proof_bundle`
- `bnb_get_trade_status`
- `bnb_competition_register`
- `bnb_emergency_pause`

`bnb_execute_trade` is guarded by live mode, a CMC-backed risk check, TWAK REST wallet validation, router quote validation, daily/drawdown limits, and BSC receipt proof. The one-click dashboard action uses `bnb_run_autonomous_cycle` and stays dry-run unless live flags are explicitly enabled.

## Frontend

```bash
rtk pnpm -C frontend run build
rtk pnpm -C frontend run dev
```

The active frontend does not load browser wallet providers. It renders the BNB cockpit and delegates execution to the TWAK agent wallet through FastAPI.

## Live Mainnet Cycle

Run these commands only after the TWAK REST bridge is bound to the funded agent wallet and one CMC key is exported in your shell:

```bash
rtk uv --project backend run python backend/scripts/configure-bnb-live-env.py --disable-live
backend/scripts/restart-bnb-backend.sh
rtk uv --project backend run python backend/scripts/smoke-cmc-tool.py
rtk uv --project backend run python backend/scripts/prove-cmc-agent-hub-live.py
rtk uv --project backend run python backend/scripts/configure-cmc-signal-tool.py  # optional pin
rtk uv --project backend run python backend/scripts/configure-bnb-live-env.py \
  --enable-live
backend/scripts/restart-bnb-backend.sh
rtk uv --project backend run python backend/scripts/check-bnb-mainnet-readiness.py --live
rtk uv --project backend run python backend/scripts/run-bnb-live-cycle.py \
  --i-understand-this-trades-real-bsc-mainnet
rtk uv --project backend run python backend/scripts/run-bnb-live-loop.py \
  --max-cycles 7 \
  --interval-seconds 86400 \
  --i-understand-this-trades-real-bsc-mainnet
```

`backend/scripts/run-bnb-live-cycle.py` submits one guarded trade. `backend/scripts/run-bnb-live-loop.py` repeats that same guarded path for competition operation, re-running live preflight before every cycle and stopping on the first blocker or missing tx hash. Both refuse to submit a transaction unless `bnb_live_preflight` returns `readyForLiveTrade=true`. After TWAK signs and submits, each cycle requires a BSC tx hash and checks `bnb_get_trade_status` for receipt/proof status.

`backend/scripts/prove-cmc-agent-hub-live.py` proves the CMC Agent Hub MCP status, signal tool recommendation or pinned call, live price snapshot, and `bnb_live_preflight` CMC signal while execution is still dry-run. `backend/scripts/smoke-cmc-skill-hub.py --execute-preview` verifies backend Skill Hub MCP by running `find_skill(query="btc price")` and previewing `execute_skill(unique_name="btc_cross_asset_correlation", parameters={"preview": true})` through FastAPI. `backend/scripts/configure-bnb-live-env.py --enable-live` refuses to turn on live flags unless a CMC key is already present in the final backend env. If `CMC_AGENT_HUB_SIGNAL_TOOL` is absent, preflight and autonomous cycles auto-discover a signal-like Agent Hub tool from live MCP `tools/list`.

## BNB Hack Demo

```bash
scripts/verify-bnb-stack.sh
scripts/verify-legwork-mechanism-fit.sh
(cd backend && rtk uv run python -m pytest -q)
(cd backend && rtk uv run python -m compileall -q app tests scripts)
rtk uv --project backend run python backend/scripts/smoke-cmc-tool.py
rtk uv --project backend run python backend/scripts/check-bnb-mainnet-readiness.py
(cd frontend && rtk pnpm exec vitest run)
(cd frontend && rtk pnpm run build)
(cd frontend && rtk pnpm exec playwright test e2e/tests/bnb-mcp-api.spec.ts e2e/tests/bnb-cockpit-layout.spec.ts e2e/tests/bnb-trading-dashboard.spec.ts --project=chromium)
```

Demo references:

- `docs/bnb-agent-skill.md`
- `docs/bnb-hack-submission-runbook.md`
- `docs/bnb-hack-live-trading-runbook.md`

## Plans

The BNB hack implementation plan lives in:

```text
plans/260605-0118-bnb-hack-agent-wallet-trading/plan.md
```

Phase 1 configures the sponsor stack and BSC-only runtime surface. Later phases add CMC strategy state, Trust Wallet Agent Kit execution, dashboard evidence, and the final runbook.

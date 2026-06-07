# OmniAgent FastAPI Backend

Python backend target for BNB Hack Track 1. It preserves the current frontend API contract while moving the agent runtime toward `bnbagent`, CMC, TWAK, and BSC proof logging.

## Run

```bash
rtk uv sync --group dev
twak serve --rest --host localhost --port 8787
BNB_TRADING_ENABLED=false ALLOW_AGENT_RUN=false rtk uv run python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend can point to it with:

```bash
VITE_API_URL=http://localhost:8000 rtk pnpm -C frontend run dev
```

## Live Gates

Live execution stays blocked unless all of these are true:

- `BNB_TRADING_ENABLED=true`
- `ALLOW_AGENT_RUN=true`
- TWAK mode is `rest`, its bridge is reachable, and the bridge wallet matches the configured agent wallet
- The TWAK REST bridge exposes `POST /actions/get_address`, `POST /actions/swap`, and `POST /actions/competition_status`
- CMC signal, token allowlist, slippage, drawdown, daily trade, and emergency-pause checks pass
- The trade has a router-backed PancakeSwap transaction
- The agent wallet has gas BNB plus at least one in-scope trading asset such as USDT, USDC, CAKE, or TWT

x402 status is exposed through `bnb_paid_resource_status`. It reports `claimStatus: "not_claimed"` until a real x402 rail and `X402_PAYMENT_VERIFIER_URL` are configured, even if CMC credentials are present.

## Verify

```bash
rtk uv run pytest -q
rtk uv run python -m compileall -q app tests
rtk uv run python scripts/check-bnb-mainnet-readiness.py
```

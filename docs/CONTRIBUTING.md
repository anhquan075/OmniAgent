# Contributing to OmniAgent

OmniAgent is a BSC mainnet autonomous trading agent. Before diving in, read
[docs/problem-and-approach.md](problem-and-approach.md) for the design rationale
and [docs/ARCHITECTURE.md](ARCHITECTURE.md) for the full technical picture.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.11.x | [python.org](https://www.python.org/downloads/) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org/) |
| pnpm | 9+ | `npm i -g pnpm` |
| uv | latest | [docs.astral.sh/uv](https://docs.astral.sh/uv/) |
| twak CLI | latest | Trust Wallet Agent Kit — follow TWAK setup docs |
| rtk | latest | Bundled with the repo toolchain |

Python must be exactly 3.11.x. The `pyproject.toml` pins `>=3.11,<3.12`.

---

## Local Setup

```bash
# 1. Install all dependencies
pnpm install
rtk uv sync --project backend --group dev

# 2. Copy env templates
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill in `backend/.env` with your BSC RPC URL, CMC API key, and TWAK credentials.
The required variables are documented in the root `README.md`.

```bash
# 3. Start the TWAK REST bridge
twak serve --rest --host localhost --port 8787

# 4. Start the backend (dry-run mode)
BNB_TRADING_ENABLED=false ALLOW_AGENT_RUN=false \
  rtk uv --project backend run python -m uvicorn app.main:app --host localhost --port 8000

# 5. Start the frontend
rtk pnpm -C frontend run dev
```

Dashboard is at `http://localhost:3000`. Live trading stays off until you
explicitly set `BNB_TRADING_ENABLED=true` — don't do that during development.

---

## Project Structure

```
backend/    Python 3.11 FastAPI service, uv-managed (pyproject.toml)
frontend/   TypeScript/React dashboard, pnpm-managed (package.json)
docs/       Documentation — in .gitignore, see note below
scripts/    Root-level utility scripts (active surface check, etc.)
backend/scripts/   Backend-specific scripts: readiness check, live cycle runner, CMC smoke tests
backend/tests/     pytest suite (91 tests across 10 test files)
```

### Key backend services

```
backend/app/services/
  agent/    Autonomous cycle, strategy, proof scoring
  trading/  PancakeSwap quoting, swap execution, risk gates
  cmc/      CMC Agent Hub MCP client, market report formatter
  twak/     Trust Wallet Agent Kit REST bridge
  wallet/   Wallet state, balance checks
```

---

## Running Tests

**Backend:**

```bash
cd backend && .venv/bin/python -m pytest -q
```

**Frontend:**

```bash
cd frontend && rtk pnpm exec vitest run
```

All 91 backend tests must pass before opening a PR. The test suite covers the
trade work order FSM, proof scoring, MCP contract, autonomous loop, and service
OOP contracts — so a failing test usually points directly at what broke.

---

## Useful Scripts

These live in `backend/scripts/` and run via `rtk uv --project backend run python`:

| Script | What it does |
|--------|-------------|
| `check-bnb-mainnet-readiness.py` | Runs the 9-check live preflight gate |
| `run-bnb-live-cycle.py` | Executes one guarded live cycle (requires `--i-understand-this-trades-real-bsc-mainnet`) |
| `smoke-cmc-tool.py` | Verifies CMC Agent Hub MCP connectivity |
| `smoke-cmc-skill-hub.py` | Verifies CMC Skill Hub connectivity |
| `prove-cmc-agent-hub-live.py` | Produces a live proof bundle from CMC |
| `configure-cmc-signal-tool.py` | Configures which CMC signal tool the agent uses |

---

## Where to Start

### Add a new CMC signal tool

The agent discovers and calls CMC Agent Hub tools dynamically. To add support
for a new signal tool:

1. Look at `backend/app/services/cmc/` — the MCP client and tool discovery logic live here.
2. Add a new tool handler or extend the existing dispatcher.
3. Write a test in `backend/tests/test_mcp_contract.py` to cover the new tool's contract.
4. Smoke-test it with `backend/scripts/smoke-cmc-tool.py`.

### Add a new risk check

The risk gate runs before every trade. To add a check:

1. Find the risk policy in `backend/app/services/trading/` (the preflight and
   drawdown logic).
2. Add your check to the gate — it should return a clear `reason` string on
   failure so the proof bundle captures it.
3. Add a test in `backend/tests/` covering the new gate condition.
4. Run `check-bnb-mainnet-readiness.py` to confirm the preflight still passes
   with valid credentials.

---

## A Note on `docs/`

The `docs/` directory is in `.gitignore`. If you change or add documentation,
you need to force-add it:

```bash
git add -f docs/CONTRIBUTING.md
git add -f docs/ARCHITECTURE.md
```

This is intentional — docs are tracked selectively to keep the repo clean.

---

## Safety Reminders

- `BNB_TRADING_ENABLED` defaults to `false`. Keep it that way during development.
- Never commit `backend/.env` or any file containing secrets.
- The live cycle scripts have hard guards — they won't submit unless the 9-check
  preflight passes. Don't try to bypass them.
- The LLM advisor (OpenRouter) is optional. The agent runs fully deterministic
  without it.

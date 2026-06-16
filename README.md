# OmniAgent

OmniAgent is a BSC mainnet autonomous trading agent built for [BNB Hack Track 1: Autonomous Trading Agents](https://dorahacks.io/hackathon/bnbhack-twt-cmc/detail). It reads live market signals from the CoinMarketCap Agent Hub, runs them through a deterministic strategy reinforced by an optional LLM advisor, and executes guarded swaps on PancakeSwap V2 through the Trust Wallet Agent Kit — all without human intervention. The goal wasn't to build the most profitable bot. It was to build one that could be trusted to run unsupervised, produce verifiable evidence of every decision, and fail safely when something goes wrong. See [docs/problem-and-approach.md](docs/problem-and-approach.md) for the full reasoning behind the design.

**Live proof**: wallet `0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25` registered with the BNB Hack contract in tx [`0xc9e4e4...`](https://bscscan.com/tx/0xc9e4e4ca69156d20da4f8b5f343ee1354dfac72c40363d8e6d32b51f712c3cf4) (block 102615129), then submitted the first TWAK-signed trade tx [`0x6a1ab4...`](https://bscscan.com/tx/0x6a1ab4dd0275f0e51756bdb6b18c7805b0e022a95c8c8f70707b09cf839063f9) (block 102780454, `proof.valid=true`).

> **Live trading is disabled by default.** Set `BNB_TRADING_ENABLED=true` to enable real BSC transactions (`settings.py:53`).

---

## Quick Start

Install dependencies and copy the env templates:

```bash
pnpm install
rtk uv sync --project backend --group dev
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill in your BSC RPC URL, CMC API key, and Trust Wallet Agent Kit credentials in `backend/.env`. Then start the TWAK REST bridge and the backend:

```bash
twak serve --rest --host localhost --port 8787
BNB_TRADING_ENABLED=false ALLOW_AGENT_RUN=false \
  rtk uv --project backend run python -m uvicorn app.main:app --host localhost --port 8000
```

Start the frontend:

```bash
rtk pnpm -C frontend run dev
```

The dashboard opens at `http://localhost:3000`. All actions run dry-run by default — no real trades until you explicitly enable live mode.

---

## How It Works

Each autonomous cycle runs five stages (`autonomous_cycle.py:26-60`):

1. **SENSE** — fetches a live price snapshot from CMC and checks wallet/TWAK status
2. **STRATEGY** — runs a deterministic momentum check (Heikin-Ashi signal when OHLC data is available) and optionally consults an OpenRouter LLM advisor; the LLM can only reduce or hold, never escalate
3. **QUOTE** — calls `getAmountsOut` on the PancakeSwap V2 router (`0x10ED43C718714eb63d5aA57B78B54704E256024E`) via raw `eth_call`
4. **RISK** — checks daily trade count, drawdown limits ($25 max trade, 30% max drawdown), and the 9-check live preflight gate
5. **SIGN** — submits the swap calldata to TWAK at `localhost:8787`, waits for a BSC tx hash, and records a proof bundle

The proof layer produces an 8-check scorecard and a 7-state trade work order FSM. The score is explanatory only — hard blockers decide readiness, not the number.

---

## Active Network

| Item | Value |
|------|-------|
| Chain | BNB Smart Chain mainnet |
| Chain ID | `56` |
| Explorer | `https://bscscan.com` |
| DEX | PancakeSwap V2 |
| Tokens | BNB, WBNB, USDT, USDC, CAKE, TWT |
| Competition contract | `0x212c61b9b72c95d95bf29cf032f5e5635629aed5` |

---

## Key Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `BNB_RPC_URL` | Yes | BSC mainnet RPC endpoint |
| `BNB_TRADING_ENABLED` | No (default `false`) | Enable real BSC transactions |
| `CMC_AGENT_HUB_API_KEY` | Yes | CoinMarketCap Agent Hub MCP |
| `TW_ACCESS_ID` | Yes | Trust Wallet Agent Kit access ID |
| `TW_HMAC_SECRET` | Yes | Trust Wallet Agent Kit HMAC secret |
| `TRUST_WALLET_AGENT_KIT_BASE_URL` | Yes | TWAK REST bridge URL |
| `OPENROUTER_API_KEY` | No | LLM advisor (deepseek/deepseek-v4-pro) |

Never commit secrets. Use `backend/.env` locally; use deployment secrets in production.
`TRUST_WALLET_AGENT_KIT_CONFIG` JSON is still supported for compatibility, but direct TWAK env vars take precedence.

---

## Running Live

The live trading runbook is in [docs/bnb-hack-live-trading-runbook.md](docs/bnb-hack-live-trading-runbook.md). The short version: configure env, start TWAK, run the readiness check, then run a single guarded cycle:

```bash
rtk uv --project backend run python backend/scripts/check-bnb-mainnet-readiness.py --live
rtk uv --project backend run python backend/scripts/run-bnb-live-cycle.py \
  --i-understand-this-trades-real-bsc-mainnet
```

Both scripts refuse to submit unless `bnb_live_preflight` returns `readyForLiveTrade=true`. CMC Agent Hub MCP signal is mandatory before any real trade.

---

## Documentation

| File | What it covers |
|------|---------------|
| [docs/problem-and-approach.md](docs/problem-and-approach.md) | Why this project exists, the safety problem, and the design decisions |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full system architecture: C4 diagrams, sequence flows, FSM states, risk gates |
| [docs/bnb-hack-submission.md](docs/bnb-hack-submission.md) | Competition submission: sponsor usage, safety model, live proof evidence |
| [docs/bnb-hack-live-trading-runbook.md](docs/bnb-hack-live-trading-runbook.md) | Step-by-step runbook for the live trading window |
| [docs/bnb-agent-skill.md](docs/bnb-agent-skill.md) | ERC-8004 on-chain identity registration via BNB AI Agent SDK |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | How to set up locally, run tests, and contribute |

---

## Competition

BNB Hack Track 1: Autonomous Trading Agents — [DoraHacks submission page](https://dorahacks.io/hackathon/bnbhack-twt-cmc/detail).

Sponsor stack: BNB Chain (BSC mainnet, chain ID 56), CoinMarketCap (Agent Hub MCP + Skill Hub), Trust Wallet (Agent Kit execution), BNB AI Agent SDK (ERC-8004 identity), PancakeSwap V2 (DEX routing).

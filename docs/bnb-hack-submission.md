# BNB Hack Track 1 — Autonomous Trading Agents

## What OmniAgent Does

OmniAgent is a BSC mainnet trading agent that reads a live market signal from the CoinMarketCap
Agent Hub via MCP, runs it through a deterministic strategy engine backed by Heikin-Ashi 5-minute
candles, and executes guarded swaps on PancakeSwap V2 through the Trust Wallet Agent Kit — all
without human intervention. An optional LLM advisor (DeepSeek v4 Pro) can review the decision,
but it can only reduce position size or confirm a hold. It cannot escalate. Every trade produces
a structured proof bundle with an 8-check scorecard, a 7-state FSM trace, and a BSC receipt
anchored in an append-only ledger. The system fails closed by default: live trading requires
`BNB_TRADING_ENABLED=true` and every one of 9 preflight checks must pass before a transaction
is submitted.

---

## The Strategy

### Signal Sources

Every cycle starts with a mandatory CMC Agent Hub MCP call. The client sends `initialize` and
`tools/list` requests to `https://mcp.coinmarketcap.com/mcp` (`settings.py:87`), then calls a
configured signal tool — in the live proof run, `trending_crypto_narratives`. Without a verified
CMC signal, the preflight gate blocks the trade entirely (`live_preflight.py:72-85`). This isn't
a soft preference; it's a hard blocker.

The second signal source is a Heikin-Ashi chart computed from 5-minute OHLC candles. The service
requires at least 3 candles (`heikin_ashi_signal.py:9-10`) and produces one of three outputs:
`BUY`, `SELL`, or `WAIT` (`heikin_ashi_signal.py:23-27`). Heikin-Ashi smooths out candle noise
by averaging open/close values across periods, which makes trend reversals and continuations
easier to read than raw candlestick patterns.

### Decision Logic

The five-stage pipeline runs in sequence (`autonomous_cycle.py:26-60`):

1. **SENSE** — fetches CMC price snapshot and checks wallet/TWAK status
2. **STRATEGY** — deterministic engine evaluates CMC signal + Heikin-Ashi + drawdown + confidence
3. **QUOTE** — calls `getAmountsOut` on the PancakeSwap V2 router via raw `eth_call`
4. **RISK** — checks daily trade count, drawdown limits, and the 9-check live preflight gate
5. **SIGN** — submits swap calldata to TWAK, polls for BSC receipt, records proof bundle

The deterministic engine requires a minimum confidence of 0.62 to approve a trade
(`settings.py:51`). Below that threshold, the action is forced to `hold`
(`strategy_decision.py:113`).

### The LLM Constraint

The LLM advisor's role is explicitly bounded in code, not in a prompt. In
`strategy_decision.py:138-157`:

- If the deterministic engine returns `hold`, the function returns immediately. The LLM is never
  consulted (`strategy_decision.py:141-142`).
- If the LLM is consulted and it says `hold`, or its confidence is below 0.62, the result is
  `hold` (`strategy_decision.py:151-152`).
- If both engines approve a trade, the final position size is
  `min(deterministic_amount, llm_amount)` — never the larger of the two
  (`strategy_decision.py:153`).

This means the LLM can only make the agent more conservative. It cannot override a deterministic
hold or increase a position size.

### Position Sizing

The default maximum trade size is $25 USD (`settings.py:55`). When drawdown reaches 50% of the
configured maximum (30%), the deterministic strategy halves the maximum trade amount automatically
(`strategy_decision.py:117-119`). At 100% of the maximum drawdown, trading stops entirely.
Slippage is capped at 100 bps (`settings.py:56`).

---

## Safety Model

### 9-Check Live Preflight (`live_preflight.py:100-127`)

Every live trade must pass all 9 checks before `readyForLiveTrade=true`:

| Check | What it verifies |
|-------|-----------------|
| `wallet` | Agent wallet address is configured |
| `twak` | TWAK REST bridge is reachable and wallet-validated |
| `bnb_agent_sdk` | BNB AI Agent SDK is ready |
| `competition` | On-chain competition registration proof exists for this wallet |
| `capital` | Wallet has gas BNB and at least one in-scope trading asset |
| `cmc_agent_hub` | CMC Agent Hub MCP tools are discoverable |
| `cmc` | CMC returned a live price snapshot |
| `cmc_agent_hub_signal` | Configured CMC signal tool returned ready |
| `live_flags` | `BNB_TRADING_ENABLED=true` and `ALLOW_AGENT_RUN=true` |

There's no partial-pass mode. Any single failure blocks the trade.

### 8-Check Proof Scorecard (`proof_score.py:5-14`)

After execution, the proof scorecard evaluates:

| Check | What it confirms |
|-------|-----------------|
| `cmcSignalVerified` | CMC Agent Hub signal was called and returned valid |
| `cmcPriceFresh` | CMC price snapshot was recent |
| `riskPolicyApproved` | Risk check passed without blockers |
| `routerQuoteValid` | Live PancakeSwap quote was obtained |
| `twakWalletMatched` | TWAK wallet address matched the configured agent wallet |
| `competitionRegistered` | Competition registration is confirmed on-chain |
| `receiptProofValid` | BSC receipt was confirmed and proof is valid |
| `pnlDrawdownCompliant` | Agent is not in emergency pause |

The score is explanatory only. Hard blockers decide readiness, not the number
(`proof_score.py:47`). A trade with 7 of 8 checks passing but a missing receipt proof is still
blocked.

### Additional Guardrails

- Token universe is restricted to `BNB, USDT, USDC, CAKE, TWT` (`settings.py:71`)
- PancakeSwap V2 router is pinned to `0x10ED43C718714eb63d5aA57B78B54704E256024E` (`settings.py:65`)
- Duplicate proof digests are detected and blocked — the same tx hash can't inflate trade counts
- Emergency pause persists in the ledger and blocks all subsequent risk checks until cleared
- Trade ledger is append-only JSONL at `backend/data/trade-ledger.jsonl` (`settings.py:102`)
- Maximum 12 daily trades (`settings.py:58`)

---

## Sponsor Integrations

### CoinMarketCap Agent Hub

CMC Agent Hub is a mandatory signal gate. The client communicates via MCP JSON-RPC to
`https://mcp.coinmarketcap.com/mcp` (`settings.py:87`), sending `initialize` and `tools/list`
requests before calling the configured signal tool (`agent_hub.py:26-45`). The CMC Skill Hub
at `https://mcp.coinmarketcap.com/skill-hub/stream` (`settings.py:88`) is available for
`find_skill` and `execute_skill` calls (`skill_hub.py:43-63`). The x402 payment rail tracks
three paid resource IDs: `cmc_agent_hub`, `cmc_skill_hub`, and `twak_x402` (`x402.py:9`).

Without a valid CMC Agent Hub signal, `readyForLiveTrade` is false. This is enforced at the
preflight gate, not in a prompt.

**Special prize target**: Best Use of Agent Hub ($2K)

### Trust Wallet Agent Kit

TWAK is the sole execution layer. The agent never holds a raw private key in the application
process. The REST bridge at `localhost:8787` (`twak/rest.py:42-44`) handles signing and
broadcasting via Bearer token auth (`twak/rest.py:45`). The agent submits ABI-encoded swap
calldata for one of three PancakeSwap function signatures (`pancake.py:137-141`) and receives a
signed transaction back. The TWAK wallet address is validated against the configured agent wallet
before every live trade — a mismatch blocks execution.

The live proof trade was submitted through TWAK REST and confirmed on BSC mainnet at block
102780454 with `proof.valid=true`.

**Special prize target**: Best Use of TWAK ($2K)

### BNB AI Agent SDK

The agent registers its on-chain identity using ERC-8004 via `ERC8004Agent.register_agent()`
from the `bnbagent` SDK (`identity.py:86-128`). The agent URI is generated by
`AgentURIGenerator` and declares three supported trust modes: `self-custody`,
`twak-local-signing`, and `x402` (`identity.py:98`). The competition registration proof is
stored in the ledger and checked by the preflight gate before every live trade.

**Special prize target**: Best Use of BNB AI Agent SDK ($2K)

### PancakeSwap V2

Swap calldata is ABI-encoded locally for three function signatures: `swapExactETHForTokens`,
`swapExactTokensForETH`, and `swapExactTokensForTokens` (`pancake.py:137-141`). Route quotes
are fetched by calling `getAmountsOut` on the router contract via raw `eth_call`
(`pancake.py:150-174`). The router address is pinned to
`0x10ED43C718714eb63d5aA57B78B54704E256024E` (`settings.py:65`) and cannot be overridden at
runtime.

### BNB Chain

All network config is pinned to BSC mainnet, chain ID `56`. The competition contract is at
`0x212c61b9b72c95d95bf29cf032f5e5635629aed5` (`settings.py:64`). The autonomous loop runs on a
300-second interval (`settings.py:43`). The trade ledger records every state transition with
timestamps, and the BSC explorer links in the proof bundle point to independently verifiable
on-chain evidence.

---

## Live Proof

The system ran a complete live cycle on BSC mainnet on June 7, 2026. Agent wallet:
`0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25`.

**Competition registration** — confirmed on-chain:

```
tx:  0xc9e4e4ca69156d20da4f8b5f343ee1354dfac72c40363d8e6d32b51f712c3cf4
url: https://bscscan.com/tx/0xc9e4e4ca69156d20da4f8b5f343ee1354dfac72c40363d8e6d32b51f712c3cf4
```

**First TWAK-signed trade** — confirmed at block 102780454:

```
tx:  0x6a1ab4dd0275f0e51756bdb6b18c7805b0e022a95c8c8f70707b09cf839063f9
url: https://bscscan.com/tx/0x6a1ab4dd0275f0e51756bdb6b18c7805b0e022a95c8c8f70707b09cf839063f9
receipt: confirmed, success=true, proof.valid=true, bridgeMode=rest
```

The CMC Agent Hub signal used was `trending_crypto_narratives`, server-verified at
`2026-06-07T05:02:48.162519+00:00`. The proof bundle returned `status=ready_for_live_trade`,
`readyForLiveTrade=true`, `blockers=[]`. After the trade, the emergency pause was activated and
a follow-up risk check returned `approved=false` with reason `emergency_pause_enabled`,
confirming the pause mechanism works as designed.

The test suite passed with 91 tests and 2 warnings after the live run.

Full live proof report: `plans/reports/final-bnb-hack-live-proof-20260607.md`

---

## Verification

```bash
(cd backend && .venv/bin/python -m pytest -q)
(cd backend && .venv/bin/python -m compileall -q app tests scripts)
scripts/verify-legwork-mechanism-fit.sh
(cd frontend && rtk pnpm run build)
(cd frontend && rtk pnpm exec vitest run)
(cd frontend && rtk pnpm exec playwright test \
  e2e/tests/bnb-mcp-api.spec.ts \
  e2e/tests/bnb-cockpit-layout.spec.ts \
  e2e/tests/bnb-trading-dashboard.spec.ts \
  --project=chromium)
```

---

## Setup

```bash
rtk uv sync --project backend --group dev
cp backend/.env.example backend/.env
# fill in BSC RPC URL, CMC API key, TWAK credentials
twak serve --rest --host localhost --port 8787
BNB_TRADING_ENABLED=false ALLOW_AGENT_RUN=false \
  rtk uv --project backend run python -m uvicorn app.main:app --host localhost --port 8000
rtk pnpm -C frontend run dev
```

Required secrets (never commit these):

- `CMC_AGENT_HUB_API_KEY`, `CMC_SKILL_HUB_API_KEY`
- `TW_ACCESS_ID`, `TW_HMAC_SECRET`, `TRUST_WALLET_AGENT_KIT_CONFIG`
- `BNB_TRADING_ENABLED`, `ALLOW_AGENT_RUN`
- `OPENROUTER_API_KEY` (optional — LLM advisor)

Live trading runbook: `docs/bnb-hack-live-trading-runbook.md`

---

For full technical architecture, C4 diagrams, sequence flows, FSM states, and ADR decisions,
see [docs/ARCHITECTURE.md](./ARCHITECTURE.md).

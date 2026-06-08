# Why OmniAgent Exists

OmniAgent is a BSC mainnet autonomous trading agent that reads live market signals from the
CoinMarketCap Agent Hub, decides whether to trade using a deterministic strategy reinforced by an
LLM advisor, and executes guarded swaps on PancakeSwap V2 through the Trust Wallet Agent Kit,
all without human intervention. It was built for [BNB Hack Track 1: Autonomous Trading
Agents](https://dorahacks.io/hackathon/bnbhack-twt-cmc/detail), a competition that asks teams to
demonstrate real on-chain autonomous trading using the BNB ecosystem's sponsor stack. The goal
wasn't to build the most profitable bot. It was to build one that could be trusted to run
unsupervised, produce verifiable evidence of every decision, and fail safely when something goes
wrong.


## The Problem

Building an autonomous trading agent sounds straightforward until you try to do it responsibly.
The hard part isn't connecting to a price feed or calling a DEX router. The hard part is
answering the question: how do you know the agent did what it was supposed to do, and how do you
stop it from doing something catastrophic when conditions change?

Most agent frameworks treat safety as an afterthought. They give the LLM broad authority, trust
it to reason correctly under pressure, and add guardrails only after something breaks. That
approach works fine in demos. It falls apart in production, where market conditions shift faster
than prompts can adapt, where a single bad decision can drain a wallet, and where there's no
human watching the logs at 3am.

The second problem is verifiability. When an autonomous agent executes a trade, who can confirm
that the signal was real, the risk check actually ran, the wallet address matched, and the
on-chain receipt proves what the agent claims? Without a structured proof layer, the agent's
output is just a log file. A judge, auditor, or counterparty has no way to distinguish a
well-behaved agent from one that fabricated its own evidence.

OmniAgent was designed to address both problems at once: a pipeline where every stage produces
structured output, every decision is bounded by deterministic policy, and every trade leaves a
cryptographic trail that can be independently verified.


## Our Approach

The autonomous trading cycle runs exactly five named stages, defined in `autonomous_cycle.py:26-60`.

**SENSE** is where the agent gathers context. It calls the CoinMarketCap Agent Hub via MCP
JSON-RPC to retrieve a live market signal, fetches a price snapshot for the target token, and
checks whether the CMC signal tool is configured and responding. Nothing moves forward without a
verified signal from CMC. The live preflight gate enforces this as a hard blocker — if no CMC
signal tool is configured, `readyForLiveTrade` is false.

**STRATEGY** is where the agent decides what to do. A deterministic engine evaluates the CMC
signal, a Heikin-Ashi chart pattern across the last three candles, current drawdown, and
confidence thresholds. The minimum confidence to approve a trade is 0.62. If the deterministic
engine says hold, the cycle stops there. If it approves a trade, an optional LLM advisor
(DeepSeek v4 Pro via OpenRouter) reviews the same data and can only reduce the position size or
confirm a hold. It cannot escalate. This constraint is enforced in code, not in a prompt.

**QUOTE** is where the agent prices the trade. It calls `getAmountsOut` on the PancakeSwap V2
router via a raw `eth_call` to get a live quote for the exact token path. The router address is
pinned to `0x10ED43C718714eb63d5aA57B78B54704E256024E`. No quote, no trade.

**RISK** is where the agent checks whether the trade is within policy. This includes drawdown
limits, daily trade count, slippage bounds, wallet balance, and competition registration status.
The maximum trade size is $25 USD and the maximum drawdown is 30%. Risk checks are deterministic
and cannot be overridden by the LLM.

**SIGN** is where the trade is submitted. The Trust Wallet Agent Kit REST bridge signs and
broadcasts the transaction. The agent writes the tx hash before polling for receipt confirmation,
then validates the on-chain receipt against the expected wallet, router, and token path. A
mismatch at any point blocks the proof from being marked valid.


## Safety First

The most important design decision in OmniAgent is that the LLM advisor is structurally
incapable of making the agent more aggressive. This isn't a prompt instruction. It's enforced in
`strategy_decision.py:138-157`:
when the deterministic engine returns hold, the function returns immediately without consulting
the LLM at all. When the LLM is consulted, the final position size is `min(deterministic_amount,
llm_amount)`, never the larger of the two.

This matters because LLMs are not reliable risk managers. They can be confidently wrong, they
can hallucinate market conditions, and they can be manipulated by adversarial inputs in ways that
deterministic code cannot. By constraining the LLM to a purely advisory role with a hard ceiling,
OmniAgent gets the benefit of natural language reasoning (better rationale, context-aware
commentary) without exposing the execution path to LLM failure modes.

The drawdown gates add a second layer. When the current drawdown reaches 50% of the configured
maximum, the deterministic strategy halves the maximum trade amount automatically. At 100% of the
maximum drawdown, trading stops entirely. These thresholds are not advisory; they block execution.

Before any live trade can be submitted, the agent runs a 9-check preflight gate. The checks cover
wallet readiness, TWAK bridge connectivity, BNB Agent SDK status, competition registration,
capital availability, CMC Agent Hub connectivity, CMC price freshness, CMC signal tool
verification, and live flag configuration. Every check must pass. There's no partial-pass mode.
If any check fails, `readyForLiveTrade` is false and the trade is blocked.

Live trading is also disabled by default. The environment variable `BNB_TRADING_ENABLED=true`
must be explicitly set before any real transaction can be submitted. This means a misconfigured
deployment fails closed, not open.


## Verifiable by Design

Every trade OmniAgent executes produces a structured proof bundle. The proof scorecard evaluates
eight named checks defined in `proof_score.py:5-14`:

- `cmcSignalVerified` — the CMC Agent Hub signal was called and returned a valid response
- `cmcPriceFresh` — the CMC price snapshot was recent
- `riskPolicyApproved` — the risk check passed without blockers
- `routerQuoteValid` — a live PancakeSwap quote was obtained
- `twakWalletMatched` — the TWAK wallet address matched the configured agent wallet
- `competitionRegistered` — the agent's competition registration is confirmed on-chain
- `receiptProofValid` — the BSC receipt was confirmed and the proof is valid
- `pnlDrawdownCompliant` — the agent is not in emergency pause

The score is explanatory. What actually gates execution is the hard blocker list, not the
numeric score. A trade with seven of eight checks passing but a missing receipt proof is still
blocked. This distinction matters: it prevents a partially-complete proof from being mistaken for
a valid one.

The trade lifecycle is tracked through a seven-state finite state machine:
`intent_created` → `signal_verified` → `risk_checked` → `route_built` → `twak_submitted` →
`receipt_confirmed` → `settled`. Each state transition is recorded in the append-only trade
ledger at `backend/data/trade-ledger.jsonl`. The ledger is the authoritative record of what the
agent did and when.

Duplicate proof digests are detected and blocked, so the same transaction hash can't be used
twice to inflate confirmed trade counts. The emergency pause state persists in the ledger and
blocks all subsequent risk checks until explicitly cleared.


## What We Built On

OmniAgent is built on four sponsor integrations, each doing a specific job.

**CoinMarketCap Agent Hub** provides the market signal that starts every cycle. The client
communicates via MCP JSON-RPC to `https://mcp.coinmarketcap.com/mcp`. The live proof used the
`trending_crypto_narratives` tool, verified at `2026-06-07T05:02:48.162519+00:00`. Without a
valid CMC signal, the preflight gate blocks the trade entirely.

**Trust Wallet Agent Kit** is the sole execution layer. The agent never holds a raw private key
in the application process. TWAK's REST bridge at `localhost:8787` handles signing and
broadcasting. The agent submits swap calldata and receives a signed transaction back. This
separation means the execution key is never exposed to the application runtime.

**BNB AI Agent SDK** handles on-chain identity. The agent registers itself using ERC-8004 via
`ERC8004Agent.register_agent()`. The agent URI declares three supported trust modes:
`self-custody`, `twak-local-signing`, and `x402`. The competition registration proof is stored
in the ledger and checked by the preflight gate before every live trade.

**PancakeSwap V2** is the execution venue. Swap calldata is ABI-encoded locally for three
function signatures (`swapExactETHForTokens`, `swapExactTokensForETH`,
`swapExactTokensForTokens`) and submitted through TWAK. The token allowlist is restricted to
BNB, USDT, USDC, CAKE, and TWT.


## It Works

The system ran a complete live cycle on BSC mainnet on June 7, 2026. Here's the evidence.

The competition registration was confirmed on-chain:

```
wallet: 0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25
contract: 0x212c61b9b72c95d95bf29cf032f5e5635629aed5
tx: 0xc9e4e4ca69156d20da4f8b5f343ee1354dfac72c40363d8e6d32b51f712c3cf4
block: 102615129
status: success
https://bscscan.com/tx/0xc9e4e4ca69156d20da4f8b5f343ee1354dfac72c40363d8e6d32b51f712c3cf4
```

The receipt sender is the same TWAK/agent wallet, and the registration event emitted by the
competition contract indexes that wallet address.

The first TWAK-signed trade was confirmed at block 102780454:

```
tx: 0x6a1ab4dd0275f0e51756bdb6b18c7805b0e022a95c8c8f70707b09cf839063f9
https://bscscan.com/tx/0x6a1ab4dd0275f0e51756bdb6b18c7805b0e022a95c8c8f70707b09cf839063f9
receipt: confirmed, success=true, proof.valid=true
```

After the trade, the test suite passed with 91 tests and 2 warnings. The emergency pause was
then activated, and a follow-up risk check returned `approved=false` with reason
`emergency_pause_enabled`, confirming that the pause mechanism works as designed.

The full live proof report is at `plans/reports/final-bnb-hack-live-proof-20260607.md`.


## Where to Go Next

If you want to understand the full technical architecture, data flows, and ADR decisions, start
with [`./ARCHITECTURE.md`](./ARCHITECTURE.md). It covers the service layer, MCP tool contracts,
proof lifecycle, and the reasoning behind key design choices.

If you want to run the system yourself or contribute to it, [`./CONTRIBUTING.md`](./CONTRIBUTING.md)
has the setup steps, environment variable reference, and contribution guidelines.

If you're a competition judge or want the condensed submission narrative with sponsor usage
details and verification commands, [`./bnb-hack-submission.md`](./bnb-hack-submission.md) is the
right starting point.

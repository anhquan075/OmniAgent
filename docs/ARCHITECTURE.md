# OmniAgent — System Architecture Blueprint

> **Scope**: BSC mainnet autonomous trading agent for BNB Hack Track 1.
> **Generated from**: Source code inspection (not speculative). All claims cite `file:line`.

**Related**: [problem-and-approach.md](./problem-and-approach.md) — design rationale and safety decisions | [CONTRIBUTING.md](./CONTRIBUTING.md) — local setup and contribution guide

---

## Table of Contents

1. [System Context (C4 Level 1)](#1-system-context)
2. [Container Diagram (C4 Level 2)](#2-container-diagram)
3. [Component Diagram — Backend (C4 Level 3)](#3-component-diagram--backend)
4. [Autonomous Trading Cycle — Sequence](#4-autonomous-trading-cycle)
5. [MCP Tool Call — Sequence](#5-mcp-tool-call)
6. [Trade Execution — Sequence](#6-trade-execution)
7. [Dashboard Polling — Sequence](#7-dashboard-polling)
8. [Strategy Decision Flow](#8-strategy-decision-flow)
9. [Trade Work Order — State Machine](#9-trade-work-order-fsm)
10. [Risk Policy — Decision Gates](#10-risk-policy-gates)
11. [Live Preflight — 9-Check Readiness](#11-live-preflight)
12. [Proof Score — 8-Point Verification](#12-proof-score)
13. [Data Model — Ledger Events](#13-data-model)
14. [Service Dependency Graph](#14-service-dependency-graph)
15. [Deployment Architecture](#15-deployment-architecture)
16. [Architecture Decision Records](#16-architecture-decision-records)

---

## 1. System Context

Who interacts with OmniAgent and what external systems does it depend on.

```mermaid
graph TB
    operator["👤 Operator<br/><i>Monitors agent via dashboard,<br/>triggers manual actions</i>"]

    omniagent["🤖 OmniAgent<br/><i>Autonomous BSC trading agent:<br/>senses market signals, evaluates strategy,<br/>executes guarded spot trades on PancakeSwap</i>"]

    cmc_hub[/"CMC Agent Hub<br/><i>MCP JSON-RPC tool server<br/>for market signals</i>"/]
    cmc_skill[/"CMC Skill Hub<br/><i>Streamable HTTP MCP<br/>for strategy skills</i>"/]
    cmc_pro[/"CMC Pro API<br/><i>REST price feed</i>"/]
    bsc[/"BSC Mainnet<br/><i>BNB Smart Chain RPC +<br/>PancakeSwap V2 Router</i>"/]
    twak[/"Trust Wallet Agent Kit<br/><i>Custodial key management<br/>and swap execution</i>"/]
    openrouter[/"OpenRouter<br/><i>Optional LLM advisor<br/>deepseek-v4-pro</i>"/]

    operator -->|"Polls dashboard, invokes MCP tools<br/>HTTPS"| omniagent
    omniagent -->|"Discovers signal tools, calls them<br/>MCP JSON-RPC"| cmc_hub
    omniagent -->|"Strategy skills<br/>Streamable HTTP MCP"| cmc_skill
    omniagent -->|"Price snapshots, 45s cache<br/>REST + API key"| cmc_pro
    omniagent -->|"Quotes, receipts, chain state<br/>JSON-RPC"| bsc
    omniagent -->|"Swap execution, wallet address<br/>REST / CLI"| twak
    omniagent -->|"Advisory LLM, can reduce never override hold<br/>REST"| openrouter

    style omniagent fill:#4a9eff,stroke:#333,color:#fff
    style operator fill:#08427b,stroke:#333,color:#fff
    style cmc_hub fill:#999,stroke:#333,color:#fff
    style cmc_skill fill:#999,stroke:#333,color:#fff
    style cmc_pro fill:#999,stroke:#333,color:#fff
    style bsc fill:#999,stroke:#333,color:#fff
    style twak fill:#999,stroke:#333,color:#fff
    style openrouter fill:#999,stroke:#333,color:#fff
```

> **Source**: External URLs from [`backend/app/core/settings.py:62-98`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/core/settings.py#L62-L98)

---

## 2. Container Diagram

Three deployable containers plus their communication patterns.

```mermaid
graph TB
    operator["👤 Operator"]

    subgraph system["OmniAgent System"]
        frontend["Frontend<br/><i>React 19, Vite 6, Tailwind CSS 4</i><br/>Trading cockpit dashboard<br/>polls backend every 30s"]
        backend["Backend<br/><i>Python 3.11, FastAPI</i><br/>Trading agent runtime<br/>MCP tool server, autonomous loop"]
        twak_bridge["TWAK Bridge<br/><i>Node.js, @trustwallet/cli 0.17.0</i><br/>REST wrapper around Trust Wallet CLI<br/>isolates private keys"]
        ledger[("Trade Ledger<br/><i>JSONL file</i><br/>Append-only event log")]
    end

    operator -->|"HTTPS :4173"| frontend
    frontend -->|"GET /api/dashboard/snapshot 30s poll<br/>POST /api/mcp JSON-RPC<br/>HTTPS :8000"| backend
    backend -->|"POST /actions/swap<br/>POST /actions/get_address<br/>HTTP :8787 + Bearer token"| twak_bridge
    backend -->|"append_event<br/>get_ledger_summary<br/>File I/O"| ledger

    style frontend fill:#438dd5,stroke:#333,color:#fff
    style backend fill:#438dd5,stroke:#333,color:#fff
    style twak_bridge fill:#438dd5,stroke:#333,color:#fff
    style ledger fill:#ff9,stroke:#333
    style operator fill:#08427b,stroke:#333,color:#fff
```

> **Source**: [`backend/app/main.py:22-46`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/main.py#L22-L46), [`frontend/`](https://github.com/anhquan075/OmniAgent/tree/main/frontend) poll interval in dashboard component, [`twak-bridge/`](https://github.com/anhquan075/OmniAgent/tree/main/twak-bridge) REST surface

---

## 3. Component Diagram — Backend

Internal service architecture within the FastAPI backend.

```mermaid
graph TB
    subgraph "API Layer"
        MCP["/api/mcp<br/>JSON-RPC 2.0"]
        DASH["/api/dashboard/snapshot"]
        HEALTH["/health"]
    end

    subgraph "MCP Tool Surface"
        REGISTRY["McpToolRegistry<br/>24 allowed tools"]
        ADAPTER["DynamicAgentAdapterRegistry<br/>+ FastApiBnbAgentAdapter"]
    end

    subgraph "Agent Services"
        LOOP["AutonomousLoopService<br/>asyncio.create_task, configurable interval"]
        CYCLE["AutonomousTradingAgent<br/>5-stage pipeline"]
        STRATEGY["TradingStrategyDecisionService<br/>deterministic + optional LLM"]
        SENSING["AutonomousCycleSensing<br/>CMC signal collection"]
        COCKPIT["AgentCockpitService"]
        IDENTITY["BnbAgentIdentityService"]
    end

    subgraph "Trading Services"
        EXEC["TradeExecutionService<br/>simulate / execute"]
        RISK["RiskCheckService"]
        POLICY["RiskPolicyService<br/>8 guardrails"]
        PANCAKE["PancakeRouterService<br/>BSC router quote"]
        RECEIPT["ReceiptProofService"]
        PREFLIGHT["LivePreflightService<br/>9 checks"]
        WORKORDER["TradeWorkOrderService<br/>7-state FSM"]
        PROOFSCORE["TradeProofScoreService<br/>8-check score"]
    end

    subgraph "External Clients"
        CMC_HUB["CmcAgentHubClient"]
        CMC_SKILL["CmcSkillHubClient"]
        CMC_PRICE["CmcPriceService<br/>45s cache"]
        TWAK["TrustWalletBridge"]
        OPENROUTER["OpenRouterTradingAdvisor"]
    end

    subgraph "Persistence"
        LEDGER["TradeLedger<br/>append-only JSONL"]
    end

    MCP --> REGISTRY --> ADAPTER
    DASH --> COCKPIT
    LOOP --> CYCLE
    CYCLE --> SENSING --> CMC_HUB
    CYCLE --> STRATEGY
    STRATEGY --> OPENROUTER
    CYCLE --> PANCAKE
    CYCLE --> RISK --> POLICY
    CYCLE --> EXEC --> TWAK
    EXEC --> PANCAKE
    RISK --> LEDGER
    EXEC --> LEDGER
    POLICY --> LEDGER
    PREFLIGHT --> CYCLE
    WORKORDER --> CYCLE
    PROOFSCORE --> PREFLIGHT
    CMC_PRICE --> CMC_HUB
```

> **Source**: [`backend/app/services/container.py:28-56`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/container.py#L28-L56) (23 service classes in frozen dataclass DI)

---

## 4. Autonomous Trading Cycle

The core 5-stage pipeline executed by `AutonomousTradingAgent.run_autonomous_cycle()`.

Each stage is a hard gate: if SENSE returns no CMC signal, the cycle stops before STRATEGY runs. If RISK rejects, SIGN never executes.

```mermaid
sequenceDiagram
    participant LoopSvc as AutonomousLoopService
    participant Cycle as AutonomousTradingAgent
    participant Sense as AutonomousCycleSensing
    participant CMC as CmcAgentHubToolClient
    participant Strategy as TradingStrategyDecisionService
    participant LLM as OpenRouterTradingAdvisor
    participant Quote as PancakeRouterService
    participant Risk as RiskCheckService
    participant Exec as TradeExecutionService
    participant TWAK as TrustWalletBridge
    participant Ledger as TradeLedger

    LoopSvc->>Cycle: run_autonomous_cycle(symbol, side, amountUsd, execute)
    
    Note over Cycle: Stage 1 - SENSE
    Cycle->>Sense: collect(symbol, side, signal_source)
    Sense->>CMC: call_cmc_agent_hub_tool(toolName)
    CMC-->>Sense: cmcAgentHubSignal + cmcSnapshot
    Sense-->>Cycle: sensing result

    Note over Cycle: Stage 2 - STRATEGY
    Cycle->>Strategy: evaluate(symbol, cmc_snapshot, cmc_signal)
    Strategy->>Strategy: deterministic_decision(momentum + Heikin-Ashi)
    alt advisor enabled
        Strategy->>LLM: advise(context)
        LLM-->>Strategy: advisory decision
        Strategy->>Strategy: select_decision (min of both amounts)
    end
    Strategy-->>Cycle: action buy/sell/hold, confidence, maxAmountUsd

    alt action == hold
        Cycle-->>LoopSvc: HOLD response (no execution)
    end

    Note over Cycle: Stage 3 - QUOTE
    Cycle->>Quote: build_router_quote(symbol, side, amountUsd, priceUsd)
    Quote-->>Cycle: transaction + quoteSource

    Note over Cycle: Stage 4 - RISK
    Cycle->>Risk: run_risk_check(symbol, side, amountUsd, slippageBps)
    Risk->>Ledger: append_event(risk_checked)
    Risk-->>Cycle: approved, reasons, tradeIntentId

    Note over Cycle: Stage 5 - SIGN / EXECUTE
    alt execute == true AND approved AND no CMC blocker
        Cycle->>Exec: execute_trade(args)
        Exec->>Exec: simulate_trade (pre-check)
        Exec->>TWAK: REST swap OR CLI swap
        TWAK-->>Exec: txHash
        Exec->>Ledger: append_event(trade_executed)
        Exec-->>Cycle: status submitted, txHash
    else simulate only
        Cycle->>Exec: simulate_trade(args)
        Exec-->>Cycle: simulation canExecute + reason
    end

    Cycle-->>LoopSvc: AutonomousCycleResponse
```

> **Source**: [`backend/app/services/agent/autonomous_cycle.py:15-172`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/agent/autonomous_cycle.py#L15-L172)

---

## 5. MCP Tool Call

How the frontend (or any client) invokes an agent capability through the MCP JSON-RPC surface.

The allowlist check at the registry layer means only the 24 configured tools can be called — any other tool name returns a -32601 error before reaching a service.

```mermaid
sequenceDiagram
    participant Client as Frontend / External Client
    participant Route as POST /api/mcp
    participant Registry as McpToolRegistry
    participant Adapter as DynamicAgentAdapterRegistry
    participant Handler as FastApiBnbAgentAdapter
    participant Service as Target Service

    Client->>Route: POST /api/mcp<br/>{"jsonrpc":"2.0","method":"tools/call","params":{"name":"bnb_risk_check","arguments":{...}}}
    Route->>Route: Validate JSON-RPC envelope
    Route->>Route: Check session header (X-Session-Id)

    alt method == "tools/list"
        Route->>Registry: list_tools()
        Registry->>Registry: Filter by allowed_tools config (24 tools)
        Registry-->>Route: Tool definitions array
        Route-->>Client: {"result": [...tools]}
    else method == "tools/call"
        Route->>Registry: call_tool(name, arguments)
        Registry->>Registry: Check name in allowed_tools
        alt not in allowlist
            Registry-->>Route: Error: tool not allowed
            Route-->>Client: {"error": {"code":-32601}}
        else allowed
            Registry->>Adapter: dispatch(tool_name, arguments)
            Adapter->>Adapter: Lookup handler by tool_name
            Adapter->>Handler: handle(tool_name, arguments)
            Handler->>Service: Call mapped static method
            Service-->>Handler: Result dict
            Handler-->>Adapter: Formatted response
            Adapter-->>Registry: Tool result
            Registry-->>Route: Success payload
            Route-->>Client: {"result": {"content":[...]}}
        end
    end
```

> **Source**: [`backend/app/api/routes/mcp.py:21-56`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/api/routes/mcp.py#L21-L56), [`backend/app/services/mcp/tools.py`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/mcp/tools.py)

---

## 6. Trade Execution

Detailed sequence within `TradeExecutionService.execute_trade()` — from simulation pre-check through TWAK dispatch to receipt confirmation.

Notice the 11-check simulation pre-check that runs before any TWAK call: if any blocker is present, the trade is logged as blocked and the function returns without touching the wallet.

```mermaid
sequenceDiagram
    participant Cycle as AutonomousTradingAgent
    participant Exec as TradeExecutionService
    participant Policy as RiskPolicyService
    participant Config as TrustWalletConfigService
    participant TWAK_REST as TrustWalletRestClient
    participant TWAK_CLI as TrustWalletCliClient
    participant BSC as BSC RPC
    participant Ledger as TradeLedger
    participant Receipt as ReceiptProofService

    Cycle->>Exec: execute_trade(symbol, side, amountUsd, transaction, signal, ...)

    Note over Exec: Pre-check: simulate_trade()
    Exec->>Exec: execution_blockers()
    Note over Exec: 11 checks: wallet, twakReady,<br/>TWAK live, trading_enabled,<br/>allow_agent_run, competition,<br/>CMC signal, CMC tool blocker,<br/>policy approved, transaction present,<br/>chainId == 56

    alt blockers found
        Exec->>Ledger: append_event("trade_blocked", {reason, simulation})
        Exec-->>Cycle: {simulation: {canExecute: false, blockers}}
    else all clear
        Exec->>Config: get_trust_wallet_bridge_config()
        Config-->>Exec: {mode: "rest" or "cli", ...}

        alt mode == "rest"
            Exec->>TWAK_REST: POST /actions/swap {from, to, amount, slippage}
            Note over TWAK_REST: Signs tx with isolated key
            TWAK_REST->>BSC: Submit signed transaction
            BSC-->>TWAK_REST: txHash
            TWAK_REST-->>Exec: {txHash, status: "submitted"}
        else mode == "cli"
            Exec->>TWAK_CLI: twak swap --from BNB --to CAKE --amount 0.05
            TWAK_CLI->>BSC: Submit signed transaction
            BSC-->>TWAK_CLI: txHash
            TWAK_CLI-->>Exec: {txHash, status: "submitted"}
        end

        Exec->>Ledger: append_event("trade_executed", {txHash, submissionProof})
        Exec-->>Cycle: {status: "submitted", txHash}

        Note over Receipt: Async: Receipt confirmation
        Receipt->>BSC: eth_getTransactionReceipt(txHash)
        BSC-->>Receipt: {status: 1, gasUsed, ...}
        Receipt->>Ledger: append_event("trade_receipt_confirmed", {receipt, proof})
    end
```

> **Source**: [`backend/app/services/trading/execution.py`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/trading/execution.py)

---

## 7. Dashboard Polling

How the frontend cockpit maintains near-real-time state.

The four parallel data fetches (preflight, ledger, proof score, work order) run concurrently on every poll, so the dashboard always shows a consistent snapshot of the agent's current state.

```mermaid
sequenceDiagram
    participant FE as Frontend (React)
    participant BE as Backend :8000
    participant Cockpit as AgentCockpitService
    participant Preflight as LivePreflightService
    participant Ledger as TradeLedger
    participant ProofScore as TradeProofScoreService
    participant WorkOrder as TradeWorkOrderService

    loop Every 30 seconds
        FE->>BE: GET /api/dashboard/snapshot
        BE->>Cockpit: get_cockpit_snapshot()

        par Parallel data collection
            Cockpit->>Preflight: get_live_preflight()
            Preflight-->>Cockpit: {readyToEnableLive, readyForLiveTrade, checks, blockers}
        and
            Cockpit->>Ledger: get_ledger_summary()
            Ledger-->>Cockpit: {events, txEvents, control, dailyCompliance, pnl}
        and
            Cockpit->>ProofScore: score()
            ProofScore-->>Cockpit: {score, maxScore, status, hardBlockers}
        and
            Cockpit->>WorkOrder: current_work_order()
            WorkOrder-->>Cockpit: {state, stages, evidence}
        end

        Cockpit-->>BE: Full snapshot payload
        BE-->>FE: JSON response
        FE->>FE: Update dashboard panels
    end

    Note over FE: User clicks tool invocation
    FE->>BE: POST /api/mcp {"method":"tools/call","params":{"name":"bnb_live_preflight"}}
    BE-->>FE: {"result": {preflight data}}
```

> **Source**: [`frontend/src/components/dashboard/BnbTradingAgentDashboard.tsx`](https://github.com/anhquan075/OmniAgent/tree/main/frontend/src/components/dashboard), [`backend/app/api/routes/dashboard.py`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/api/routes/dashboard.py)

---

## 8. Strategy Decision Flow

How the agent decides whether to trade, hold, or reduce position size.

The key constraint: if the deterministic engine returns hold, the LLM is never consulted. If both engines approve, the final position size is the minimum of the two amounts, never the larger.

```mermaid
flowchart TD
    START([Strategy Evaluate]) --> DET[Deterministic Decision]
    
    DET --> CHECK_ALLOW{Token in allowlist?}
    CHECK_ALLOW -->|No| HOLD_REASON["reasons += token_not_allowlisted"]
    CHECK_ALLOW -->|Yes| CHECK_PRICE{Live price available?}
    CHECK_PRICE -->|No| HOLD_REASON2["reasons += live_price_missing"]
    CHECK_PRICE -->|Yes| CHECK_MOMENTUM

    CHECK_MOMENTUM{Momentum checks}
    CHECK_MOMENTUM -->|Buy + falling knife<br/>24h≤-6% AND 1h≤-1%| HOLD_REASON3["reasons += falling_knife_momentum"]
    CHECK_MOMENTUM -->|Buy + overextended<br/>24h≥12% AND 1h≥2.5%| HOLD_REASON4["reasons += entry_overextended"]
    CHECK_MOMENTUM -->|"Buy + 7d lte -12% AND 24h neg"| HOLD_REASON5["reasons += multi_day_downtrend"]
    CHECK_MOMENTUM -->|Pass| HEIKIN

    HEIKIN{Heikin-Ashi 5m signal}
    HEIKIN -->|Buy requested + sell signal| HOLD_REASON6["reasons += heikin_ashi_5m_sell_signal"]
    HEIKIN -->|No conflict| CONFIDENCE

    CONFIDENCE[Calculate confidence<br/>base=0.66, +0.08 favorable 1h/24h,<br/>+0.06 sell alignment,<br/>+tactical strength/500 max 0.12]
    CONFIDENCE --> CONF_CHECK{confidence ≥ 0.62<br/>AND no reasons?}
    CONF_CHECK -->|No| HOLD[action = HOLD]
    CONF_CHECK -->|Yes| DET_PASS[action = requested side]

    DET_PASS --> LLM_CHECK{Advisor enabled?}
    LLM_CHECK -->|No| FINAL_DET[Source: deterministic]
    LLM_CHECK -->|Yes| LLM_CALL[OpenRouter advise]
    LLM_CALL --> LLM_RESULT{LLM says hold<br/>OR confidence below 0.62?}
    LLM_RESULT -->|Yes| HOLD_LLM[action = HOLD<br/>Source: openrouter]
    LLM_RESULT -->|No| MERGE["maxAmountUsd = min of det, llm<br/>Source: openrouter"]

    HOLD_REASON --> HOLD
    HOLD_REASON2 --> HOLD
    HOLD_REASON3 --> HOLD
    HOLD_REASON4 --> HOLD
    HOLD_REASON5 --> HOLD
    HOLD_REASON6 --> HOLD

    style HOLD fill:#f96,stroke:#333
    style DET_PASS fill:#6f9,stroke:#333
    style MERGE fill:#6f9,stroke:#333
    style HOLD_LLM fill:#f96,stroke:#333
```

> **Key rule**: The LLM advisor can only **reduce** position size or **override to hold**. It can NEVER escalate from hold to trade.
>
> **Source**: [`backend/app/services/agent/strategy_decision.py:58-157`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/agent/strategy_decision.py#L58-L157)

---

## 9. Trade Work Order FSM

Every trade intent progresses through a 7-state finite state machine.

The FSM creates an audit trail: every state transition is logged to the append-only ledger, so the full history of a trade intent is recoverable even if the process crashes mid-cycle.

```mermaid
stateDiagram-v2
    [*] --> intent_created: Trade intent generated

    intent_created --> signal_verified: CMC signal collected (sense stage)
    intent_created --> blocked: Any stage fails

    signal_verified --> risk_checked: Risk policy passes (decide stage)
    signal_verified --> blocked: Risk rejected

    risk_checked --> route_built: PancakeSwap router quote valid (quote stage)
    risk_checked --> blocked: Quote fails

    route_built --> twak_submitted: TWAK swap submitted (sign stage)
    route_built --> blocked: Execution blocked

    twak_submitted --> receipt_confirmed: On-chain receipt validated
    twak_submitted --> failed: TX reverted or timeout

    receipt_confirmed --> settled: Evidence bundle complete

    blocked --> [*]: Terminal (requires new intent)
    failed --> [*]: Terminal
    settled --> [*]: Terminal (success)

    note right of blocked: Hard blockers logged
    note right of settled: Proof score calculated
```

**States** (from `trade_work_order.py:9-17`):

| State | Description | Terminal? |
|---|---|---|
| `intent_created` | Trade intent generated with UUID | No |
| `signal_verified` | CMC Agent Hub signal collected and validated | No |
| `risk_checked` | All risk policy guardrails passed | No |
| `route_built` | PancakeSwap V2 Router returned valid quote with tx data | No |
| `twak_submitted` | Swap submitted to TWAK (REST or CLI) | No |
| `receipt_confirmed` | On-chain receipt proof validated | Yes |
| `settled` | Full evidence bundle assembled | Yes |
| `blocked` | Hard blocker encountered at any stage | Yes |
| `failed` | TX reverted or TWAK error | Yes |
| `paused` | Emergency pause activated | Yes |

> **Source**: [`backend/app/services/trading/trade_work_order.py:4-17`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/trading/trade_work_order.py#L4-L17)

---

## 10. Risk Policy Gates

Eight guardrail checks that MUST all pass before any trade is approved.

The system fails closed: a missing signal source, an exceeded drawdown limit, or an active emergency pause all produce the same result, rejection with a logged reason.

```mermaid
flowchart LR
    INPUT([TradePolicyInput]) --> G1

    G1{Token in<br/>allowlist?} -->|No| REJECT
    G1 -->|Yes| G2{Side is<br/>buy or sell?}
    G2 -->|No| REJECT
    G2 -->|Yes| G3{Amount greater than 0?}
    G3 -->|No| REJECT
    G3 -->|Yes| G4{"Amount lte $25 max?"}
    G4 -->|No| REJECT
    G4 -->|Yes| G5{"Slippage lte 100 bps?"}
    G5 -->|No| REJECT
    G5 -->|Yes| G6{Emergency<br/>pause off?}
    G6 -->|Paused| REJECT
    G6 -->|Off| G7{"Drawdown lt 30%?"}
    G7 -->|Over limit| REJECT
    G7 -->|Under| G8{"Daily trades lt 12?"}
    G8 -->|Over limit| REJECT
    G8 -->|Under| G9{Signal source<br/>present?}
    G9 -->|No| REJECT
    G9 -->|Yes| APPROVE([Approved])

    REJECT([Rejected])

    style APPROVE fill:#6f9,stroke:#333
    style REJECT fill:#f96,stroke:#333
```

**Configurable limits** (from `settings.py:55-58`):

| Parameter | Default | Env Var |
|---|---|---|
| Max trade USD | $25 | `BNB_MAX_TRADE_USD` |
| Max slippage | 100 bps (1%) | `BNB_MAX_SLIPPAGE_BPS` |
| Max drawdown | 30% | `BNB_MAX_DRAWDOWN_PCT` |
| Max daily trades | 12 | `BNB_MAX_DAILY_TRADES` |
| Token allowlist | BNB, USDT, USDC, CAKE, TWT | `BNB_TOKEN_ALLOWLIST` |

> **Source**: [`backend/app/services/trading/policy.py:16-64`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/trading/policy.py#L16-L64)

---

## 11. Live Preflight

9 readiness checks that must pass before `BNB_TRADING_ENABLED=true` can be safely set.

The two-tier design separates configuration readiness (8 checks) from live execution readiness (flags + funded route). You can confirm the system is correctly configured before ever enabling live trading.

```mermaid
flowchart TD
    subgraph enable["Required Before Enable - 8 checks"]
        W[wallet<br/>Agent wallet configured]
        T[twak<br/>TWAK REST validated]
        S[bnb_agent_sdk<br/>SDK ready]
        C[competition<br/>Registration proof stored]
        K[capital<br/>Gas + in-scope asset]
        H[cmc_agent_hub<br/>MCP tools discoverable]
        P[cmc<br/>Live price returned]
        SIG[cmc_agent_hub_signal<br/>Signal tool ready + server-verified]
    end

    subgraph live_only["Required For Live Trade Only"]
        F[live_flags<br/>BNB_TRADING_ENABLED=true<br/>ALLOW_AGENT_RUN=true]
    end

    subgraph funded["Funded Route Validation"]
        FR[funded_route<br/>Dry-run cycle produces<br/>router transaction]
    end

    W --> READY{All 8 pass?}
    T --> READY
    S --> READY
    C --> READY
    K --> READY
    H --> READY
    P --> READY
    SIG --> READY
    READY -->|Yes| STATUS_ENABLE[status: ready_to_enable_live]
    READY -->|No| STATUS_BLOCKED[status: blocked]

    STATUS_ENABLE --> F
    STATUS_ENABLE --> FR
    F --> LIVE{All pass?}
    FR --> LIVE
    LIVE -->|Yes| STATUS_LIVE[status: ready_for_live_trade]
    LIVE -->|No| STATUS_NOT_YET[status: flags missing]

    style STATUS_LIVE fill:#6f9,stroke:#333
    style STATUS_BLOCKED fill:#f96,stroke:#333
```

> **Source**: [`backend/app/services/trading/live_preflight.py:100-128`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/trading/live_preflight.py#L100-L128)

---

## 12. Proof Score

8-point verification score measuring trade evidence completeness.

The score is explanatory, not a gate. Hard blockers (preflight failures, receipt failures, emergency pause) block execution regardless of the numeric score.

```mermaid
flowchart LR
    subgraph checks["8 Proof Checks"]
        direction TB
        C1[cmcSignalVerified<br/>CMC signal ready + serverVerified]
        C2[cmcPriceFresh<br/>CMC price check passes]
        C3[riskPolicyApproved<br/>No risk blocker in preflight]
        C4[routerQuoteValid<br/>funded_route check passes]
        C5[twakWalletMatched<br/>TWAK check passes]
        C6[competitionRegistered<br/>Competition check passes]
        C7[receiptProofValid<br/>Receipt proof valid == true]
        C8[pnlDrawdownCompliant<br/>No emergency pause]
    end

    C1 --> SCORE[Score: N of 8]
    C2 --> SCORE
    C3 --> SCORE
    C4 --> SCORE
    C5 --> SCORE
    C6 --> SCORE
    C7 --> SCORE
    C8 --> SCORE
    SCORE --> STATUS{Hard blockers?}
    STATUS -->|Yes| BLOCKED[status: blocked]
    STATUS -->|No and 8 of 8| PASS[status: pass]
    STATUS -->|No and less than 8| INCOMPLETE[status: incomplete]

    style PASS fill:#6f9,stroke:#333
    style BLOCKED fill:#f96,stroke:#333
    style INCOMPLETE fill:#ff9,stroke:#333
```

> **Note**: Score is explanatory only. Hard blockers (preflight failures, receipt failures, emergency pause) override the score.
>
> **Source**: [`backend/app/services/trading/proof_score.py:5-48`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/trading/proof_score.py#L5-L48)

---

## 13. Data Model

The ledger is the system's memory: every event — trade attempts, blocks, receipts, pauses — is appended with a `tradeIntentId` that links related events across the full lifecycle of a trade.

### Trade Ledger Event Schema

The append-only JSONL ledger at `backend/data/trade-ledger.jsonl` stores all trading events.

```mermaid
erDiagram
    LEDGER_EVENT {
        string eventType "e.g. trade_executed, trade_blocked, risk_checked"
        string tradeIntentId "intent-uuid12 links related events"
        string txHash "0x hex - present on confirmed trades"
        string action "buy, sell, execute_trade, or emergency_pause"
        string payload "Event-specific JSON data"
        string createdAt "ISO 8601 UTC timestamp"
    }

    PAYLOAD_TRADE_EXECUTED {
        string status "submitted"
        string txHash "0x..."
        string network "bsc"
        string submissionProof "CMC signal + strategy + quote"
        string cmcAgentHubSignal "serverVerified signal"
    }

    PAYLOAD_TRADE_BLOCKED {
        string reason "semicolon-separated blockers"
        string simulation "full simulation state"
    }

    PAYLOAD_RISK_CHECKED {
        string approved "true or false"
        string amountUsd "decimal amount"
        string policy "full policy evaluation"
    }

    LEDGER_EVENT ||--o| PAYLOAD_TRADE_EXECUTED : "eventType = trade_executed"
    LEDGER_EVENT ||--o| PAYLOAD_TRADE_BLOCKED : "eventType = trade_blocked"
    LEDGER_EVENT ||--o| PAYLOAD_RISK_CHECKED : "eventType = risk_checked"
```

### Ledger Summary Derived Views

```mermaid
erDiagram
    LEDGER_SUMMARY {
        string events "Last N events reversed"
        string txEvents "Events with txHash"
        string control "emergencyPaused bool"
        string dailyCompliance "tradeCount, todayTradeCount, progress"
        string pnl "totalReturnPct, maxDrawdownPct"
        string ledgerPath "filesystem path"
    }

    DAILY_COMPLIANCE {
        int tradeCount "All-time confirmed trades"
        int submittedTradeCount "All-time submitted"
        int todayTradeCount "Today submitted"
        int todayConfirmedTradeCount "Today confirmed"
        string progress "N of 7 competition minimum"
        int minimumTrades "7"
    }

    PNL {
        string totalReturnPct "Cumulative return"
        string maxDrawdownPct "Peak-to-trough max"
    }

    LEDGER_SUMMARY ||--|| DAILY_COMPLIANCE : "dailyCompliance"
    LEDGER_SUMMARY ||--|| PNL : "pnl"
```

> **Source**: [`backend/app/services/shared/ledger.py:28-70`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/shared/ledger.py#L28-L70)

---

## 14. Service Dependency Graph

How the 23 services in `ServiceContainer` relate to each other at runtime.

The graph shows that `AutonomousTradingAgent` is the only service that touches both the strategy layer and the execution layer, all other services have a single responsibility.

```mermaid
graph TD
    subgraph "Entry Points"
        LOOP[AutonomousLoopService]
        MCP_ROUTE["/api/mcp route"]
        DASH_ROUTE["/api/dashboard route"]
    end

    subgraph "Orchestration"
        ATA[AutonomousTradingAgent]
        COCKPIT[AgentCockpitService]
        PREFLIGHT[LivePreflightService]
    end

    subgraph "Strategy"
        STRAT[TradingStrategyDecisionService]
        TACTICAL[TacticalChartSignalService]
        OR_ADVISOR[OpenRouterTradingAdvisor]
    end

    subgraph "Execution"
        EXEC[TradeExecutionService]
        PANCAKE[PancakeRouterService]
        RISK[RiskCheckService]
        POLICY[RiskPolicyService]
    end

    subgraph "External Bridges"
        TWAK_BRIDGE[TrustWalletBridge]
        TWAK_REST[TrustWalletRestClient]
        TWAK_CLI[TrustWalletCliClient]
        CMC_HUB[CmcAgentHubClient]
        CMC_TOOL[CmcAgentHubToolClient]
        CMC_SKILL[CmcSkillHubClient]
        CMC_PRICE[CmcPriceService]
    end

    subgraph "Wallet & Identity"
        WALLET[AgentWalletService]
        CAPITAL[CapitalReadinessService]
        IDENTITY[BnbAgentIdentityService]
        REG[CompetitionRegistrationService]
    end

    subgraph "Persistence & Proof"
        LEDGER[TradeLedger]
        RECEIPT[ReceiptProofService]
        PROOF[TradeProofScoreService]
        WORKORDER[TradeWorkOrderService]
    end

    LOOP --> ATA
    MCP_ROUTE --> McpToolRegistry --> ADAPTER[DynamicAgentAdapterRegistry]
    DASH_ROUTE --> COCKPIT

    ATA --> STRAT
    ATA --> PANCAKE
    ATA --> RISK
    ATA --> EXEC
    STRAT --> TACTICAL
    STRAT --> OR_ADVISOR
    STRAT --> LEDGER

    EXEC --> TWAK_BRIDGE
    TWAK_BRIDGE --> TWAK_REST
    TWAK_BRIDGE --> TWAK_CLI
    EXEC --> PANCAKE
    EXEC --> POLICY
    EXEC --> LEDGER

    RISK --> POLICY --> LEDGER
    PREFLIGHT --> ATA
    PREFLIGHT --> CMC_PRICE
    PREFLIGHT --> CMC_HUB
    PREFLIGHT --> CMC_TOOL
    PREFLIGHT --> TWAK_BRIDGE
    PREFLIGHT --> CAPITAL
    PREFLIGHT --> REG

    COCKPIT --> PREFLIGHT
    COCKPIT --> LEDGER
    COCKPIT --> PROOF
    COCKPIT --> WORKORDER
```

> **Source**: Import graph from [`backend/app/services/container.py:4-24`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/container.py#L4-L24)

---

## 15. Deployment Architecture

```mermaid
graph LR
    subgraph "Railway PaaS"
        subgraph "Backend Container"
            BE["Python 3.11<br/>FastAPI :8000<br/>uvicorn"]
            LEDGER_FILE[("trade-ledger.jsonl<br/>/app/data/")]
        end
        subgraph "Frontend Container"
            FE["Node.js<br/>Vite preview :4173"]
        end
        subgraph "TWAK Bridge Container"
            TB["Node.js<br/>@trustwallet/cli :8787"]
        end
    end

    subgraph "External"
        BSC["BSC Mainnet RPC"]
        CMC["CMC APIs"]
        OR["OpenRouter"]
    end

    FE -->|"HTTPS :8000"| BE
    BE -->|"HTTP :8787<br/>Bearer auth"| TB
    BE --> LEDGER_FILE
    BE -->|"HTTPS"| BSC
    BE -->|"HTTPS"| CMC
    BE -->|"HTTPS"| OR
    TB -->|"HTTPS"| BSC

    style LEDGER_FILE fill:#ff9,stroke:#333
```

**Container Configuration**:

| Container | Port | Restart Policy | Source |
|---|---|---|---|
| backend | 8000 | ON_FAILURE, max 10 | `backend/railway.json` |
| frontend | 4173 | ON_FAILURE, max 10 | `frontend/railway.json` |
| twak-bridge | 8787 | ON_FAILURE, max 10 | `twak-bridge/railway.json` |

---

## 16. Architecture Decision Records

### ADR-1: Python over Node.js for Backend

| | |
|---|---|
| **Status** | Accepted |
| **Context** | BNB Hack requires the `bnbagent` Python SDK (≥0.3.4) for ERC-8004 agent identity registration. The official competition tooling is Python-first. |
| **Decision** | Use Python 3.11 + FastAPI as the backend runtime. |
| **Consequence** | Native SDK integration; async-first with `asyncio`; type-safety via Pydantic. TWAK (Node.js only) must be isolated in a separate container. |
| **Evidence** | [`backend/requirements.txt`](https://github.com/anhquan075/OmniAgent/blob/main/backend/requirements.txt): `bnbagent>=0.3.4` |

---

### ADR-2: Frozen Dataclass Service Container (DI)

| | |
|---|---|
| **Status** | Accepted |
| **Context** | Need dependency injection without heavyweight frameworks. All services are stateless (static methods only). |
| **Decision** | Use `@dataclass(frozen=True)` holding `Type[...]` references. Services are never instantiated — all methods are `@staticmethod`. |
| **Consequence** | Zero runtime overhead; immutable after construction; trivially testable by swapping class references. No dependency injection library needed. |
| **Trade-off** | Cannot use instance state — all state must flow through function arguments or module-level caches (`lru_cache` for Settings). |
| **Evidence** | [`backend/app/services/container.py:28-56`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/container.py#L28-L56) |

---

### ADR-3: Protocol-Based Contracts (Structural Typing)

| | |
|---|---|
| **Status** | Accepted |
| **Context** | Need service interfaces without requiring inheritance hierarchies. Python's duck typing is implicit — we want explicit contracts. |
| **Decision** | Define `Protocol` classes in `services/contracts.py` for service boundaries (LedgerService, PriceService, ToolRegistryService, WalletBridgeService, TradingAgentService). |
| **Consequence** | Any class with matching static methods satisfies the Protocol. No base class coupling. Static type checkers enforce compliance. |
| **Evidence** | [`backend/app/services/contracts.py:1-32`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/contracts.py#L1-L32) |

---

### ADR-4: MCP Tool Surface as Primary API Pattern

| | |
|---|---|
| **Status** | Accepted |
| **Context** | BNB Hack competition evaluates agents via MCP (Model Context Protocol) tool calls. The frontend also needs to invoke agent capabilities. |
| **Decision** | Expose all agent capabilities as MCP tools via JSON-RPC 2.0 at `POST /api/mcp`. Use `tools/list` and `tools/call` methods. Maintain a configurable allowlist. |
| **Consequence** | Single unified interface for both competition evaluation and frontend UI. Tool allowlist prevents unauthorized access. Each tool maps to a service handler via `DynamicAgentAdapterRegistry`. |
| **Trade-off** | All operations go through JSON-RPC overhead. No streaming support (poll-based dashboard instead). |
| **Evidence** | [`backend/app/api/routes/mcp.py:21-56`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/api/routes/mcp.py#L21-L56), [`backend/app/core/settings.py:29-39`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/core/settings.py#L29-L39) (24 tools in allowlist) |

---

### ADR-5: Append-Only JSONL Ledger (No Database)

| | |
|---|---|
| **Status** | Accepted |
| **Context** | Need an immutable audit trail. Competition requires proof of trades. Low write volume (~12 trades/day max). |
| **Decision** | Use append-only JSONL file at `backend/data/trade-ledger.jsonl`. Events are written with `json.dumps() + "\n"`. Reads scan full file. |
| **Consequence** | Zero database dependencies; trivially portable; audit-friendly (git-diffable). Scan-based reads are acceptable at ≤100 events/day. |
| **Trade-off** | No indexing, no concurrent write safety (single-process only), linear read time. Would not scale past ~10K events. |
| **Evidence** | [`backend/app/services/shared/ledger.py:117-123`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/shared/ledger.py#L117-L123) |

---

### ADR-6: TWAK Bridge Isolation (Key Separation)

| | |
|---|---|
| **Status** | Accepted |
| **Context** | Private keys must never exist in the FastAPI process memory. Trust Wallet CLI is a Node.js package. |
| **Decision** | Run TWAK as a separate Node.js container (`twak-bridge/`) with Bearer token auth. Backend communicates via REST only. |
| **Consequence** | Private keys confined to TWAK container. Backend crash cannot leak keys. Network-level isolation possible (internal-only port). |
| **Trade-off** | Extra container; REST overhead for every swap; requires HMAC auth management. |
| **Evidence** | [`backend/app/services/trading/execution.py:76-82`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/trading/execution.py#L76-L82) (REST vs CLI mode routing) |

---

### ADR-7: Proof-First Trade Lifecycle (Legwork-Inspired)

| | |
|---|---|
| **Status** | Accepted |
| **Context** | Competition requires demonstrable evidence of each trade's legitimacy (CMC signal → risk check → quote → execution → receipt). |
| **Decision** | Structure every trade as a Work Order FSM (7 states) with an 8-point Proof Score. Every stage produces auditable evidence. Blocked trades are also recorded. |
| **Consequence** | Complete audit trail from intent to settlement. Proof bundles can be submitted to competition verifiers. Dashboard shows real-time work order progress. |
| **Evidence** | [`backend/app/services/trading/trade_work_order.py:9-17`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/trading/trade_work_order.py#L9-L17), [`proof_score.py:5-14`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/trading/proof_score.py#L5-L14) |

---

### ADR-8: Deterministic Strategy + Advisory LLM (Never Override Hold)

| | |
|---|---|
| **Status** | Accepted |
| **Context** | Need predictable, auditable trading decisions. LLM hallucinations must not cause reckless trades. |
| **Decision** | Primary strategy is deterministic (CMC momentum + Heikin-Ashi 5m signals with fixed thresholds). Optional OpenRouter LLM advisor can only REDUCE position size or HOLD — it can NEVER escalate from hold to trade. |
| **Consequence** | Worst case for LLM failure = missed trade (hold). Never an unintended execution. Deterministic path is always auditable against fixed rules. |
| **Key rule**: `select_decision()` — if deterministic says HOLD, LLM is not consulted. If LLM says HOLD, final answer is HOLD. If both say trade, take `min(det.amount, llm.amount)`. |
| **Evidence** | [`backend/app/services/agent/strategy_decision.py:138-157`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/services/agent/strategy_decision.py#L138-L157) |

---

### ADR-9: Frontend Polling (No WebSocket)

| | |
|---|---|
| **Status** | Accepted |
| **Context** | Dashboard needs live-ish data. Trading cycle runs every 5 minutes (configurable). |
| **Decision** | Frontend polls `GET /api/dashboard/snapshot` every 30 seconds. Tool invocations use `POST /api/mcp` request-response. |
| **Consequence** | Simple deployment (no WebSocket upgrade handling). 30s staleness acceptable for 5-minute cycles. No connection management complexity. |
| **Trade-off** | Cannot show sub-second live updates. Wastes bandwidth when nothing changes. |

---

## Appendix: Configuration Reference

Full settings hierarchy from `backend/app/core/settings.py`:

| Group | Key | Default | Purpose |
|---|---|---|---|
| **Server** | `PORT` | 8000 | FastAPI listen port |
| | `OMNIAGENT_LOG_JSON` | true | Emit Loguru logs as JSON lines |
| | `OMNIAGENT_LOG_LEVEL` | INFO | Backend log level |
| **Trading** | `bnb_trading_enabled` | false | Master kill switch |
| | `allow_agent_run` | false | Secondary gate |
| | `bnb_max_trade_usd` | 25.0 | Per-trade cap |
| | `bnb_max_slippage_bps` | 100 | Max slippage (1%) |
| | `bnb_max_drawdown_pct` | 30.0 | Portfolio drawdown cap |
| | `bnb_max_daily_trades` | 12 | Daily trade limit |
| | `bnb_token_allowlist` | BNB,USDT,USDC,CAKE,TWT | Tradeable tokens |
| **Strategy** | `bnb_strategy_min_confidence` | 0.62 | Min confidence threshold |
| | `bnb_strategy_max_position_pct` | 0.35 | Max position size |
| | `bnb_strategy_advisor_enabled` | true | Enable LLM advisor |
| | `bnb_strategy_require_llm_for_live` | false | Require LLM for live trades |
| **Loop** | `bnb_autonomous_loop_enabled` | false | Enable autonomous loop |
| | `bnb_autonomous_loop_execute` | false | Live execution in loop |
| | `bnb_autonomous_loop_interval_sec` | 300 | Cycle interval (5 min) |
| | `bnb_autonomous_loop_initial_delay_sec` | 5 | Delay before the first automatic cycle after startup |
| | `bnb_autonomous_loop_symbol` | CAKE | Default trading symbol |
| **Chain** | `bnb_chain_id` | 56 | BSC mainnet |
| | `bnb_rpc_url` | bsc-dataseed.bnbchain.org | RPC endpoint |
| | `bnb_pancake_swap_router_address` | 0x10ED...024E | PancakeSwap V2 |
| **TWAK** | `trust_wallet_agent_kit_mode` | disabled | disabled/rest/cli |
| **CMC** | `cmc_mcp_url` | mcp.coinmarketcap.com/mcp | Agent Hub endpoint |
| | `cmc_skill_hub_mcp_url` | .../skill-hub/stream | Skill Hub endpoint |
| **LLM** | `openrouter_model` | deepseek/deepseek-v4-pro | Advisory model |

---

## Appendix: MCP Tool Surface (24 Tools)

From [`settings.py:29-39`](https://github.com/anhquan075/OmniAgent/blob/main/backend/app/core/settings.py#L29-L39) allowlist:

| Tool | Service Handler | Category |
|---|---|---|
| `bnb_agent_cockpit_snapshot` | AgentCockpitService | Dashboard |
| `bnb_get_wallet` | AgentWalletService | Wallet |
| `bnb_trust_wallet_status` | TrustWalletBridge | Wallet |
| `bnb_agent_sdk_status` | BnbAgentStatusService | Identity |
| `bnb_agent_sdk_register_identity` | BnbAgentIdentityService | Identity |
| `bnb_paid_resource_status` | X402PaymentService | Payment |
| `bnb_record_paid_signal_access` | X402PaymentService | Payment |
| `cmc_agent_hub_status` | CmcAgentHubClient | CMC |
| `cmc_agent_hub_recommend_signal_tools` | CmcAgentHubClient | CMC |
| `cmc_agent_hub_call_tool` | CmcAgentHubToolClient | CMC |
| `cmc_skill_hub_status` | CmcSkillHubClient | CMC |
| `cmc_skill_hub_find_skill` | CmcSkillHubClient | CMC |
| `cmc_skill_hub_execute_skill` | CmcSkillHubClient | CMC |
| `cmc_daily_market_overview` | CmcDailyMarketOverviewService | CMC |
| `cmc_get_price_snapshot` | CmcPriceService | CMC |
| `bnb_trade_ledger_summary` | TradeLedger | Trading |
| `bnb_quote_trade` | PancakeRouterService | Trading |
| `bnb_risk_check` | RiskCheckService | Trading |
| `bnb_simulate_trade` | TradeExecutionService | Trading |
| `bnb_execute_trade` | TradeExecutionService | Trading |
| `bnb_run_autonomous_cycle` | AutonomousTradingAgent | Trading |
| `bnb_live_preflight` | LivePreflightService | Trading |
| `bnb_get_trade_status` | ReceiptProofService | Trading |
| `bnb_live_proof_bundle` | ProofBundleService | Proof |
| `bnb_competition_register` | CompetitionRegistrationService | Identity |
| `bnb_emergency_pause` | TradeLedger | Safety |

> **Note**: `bnb_execute_trade` has an additional gate — requires `BNB_TRADING_ENABLED=true`, `ALLOW_AGENT_RUN=true`, competition registration proof, and all execution blockers to pass.

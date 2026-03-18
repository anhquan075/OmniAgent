# OmniAgent — The Sovereign Yield Robot Fleet

**OmniAgent** is an autonomous, non-custodial yield routing stack. It introduces a new paradigm: an autonomous AI capital allocator managing a fleet of Multi-VM sub-agents across BNB Chain, Solana, and TON.

**Live Stats** — `https://omniagent-production.up.railway.app/api/stats`

---

## 2. Architecture

### 2.1 System Overview

OmniAgent uses a **unified backend server** where all services run as HTTP/SSE endpoints within a single Hono application process.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Frontend (React Vite + Vercel)                    │
│           Dashboard · MCP Panel · Tool Executor · Wallet Connect       │
└───────────────────────┬─────────────────────────────────────────────┘
                          │ HTTPS
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Backend API (Node.js Hono + Docker)                  │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐  │
│  │ Hono Server │  │ MCP Server  │  │ WDK Engine  │  │ X402     │  │
│  │ /api/*      │  │ /api/mcp    │  │ REST Tools  │  │ Client   │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └──────────┘  │
│         │                │                │               │          │
│         └────────────────┴────────────────┴───────────────┘          │
│                              │                                     │
│                    ┌─────────▼──────────┐                        │
│                    │  PolicyGuard       │                        │
│                    │  Hard limits +     │                        │
│                    │  Risk validation   │                        │
│                    └─────────┬──────────┘                        │
└──────────────────────────────┼────────────────────────────────────┘
                               │ JSON-RPC / ethers.js
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Multi-VM Blockchain Layer                          │
│                                                                      │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                        │
│  │BNB Chain │   │ Solana   │   │   TON    │                        │
│  └──────────┘   └──────────┘   └──────────┘                        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    BNB Smart Chain                             │   │
│  │  ┌──────────┐   ┌──────────────┐   ┌──────────────────────┐  │   │
│  │  │ WDKVault │◄──│StrategyEngine│◄──│ ZKRiskOracle (Brevis│  │   │
│  │  │ ERC4626  │   │ Auto-rebal.  │   │ ZK) Monte Carlo     │  │   │
│  │  └────┬─────┘   └──────┬───────┘   └──────────────────────┘  │   │
│  │       │                │                                          │   │
│  │       │         ┌───────┴───────┐   ┌─────────────────┐          │   │
│  │       │         │ CircuitBreaker│   │ ExecutionAuction│          │   │
│  │       │         │ 3-signal halt │   │ Dutch auction   │          │   │
│  │       │         └───────────────┘   │ execution rights│          │   │
│  │       │                             └─────────────────┘          │   │
│  │  ┌────┴────┬──────────────┬──────────────┐                     │   │
│  │  ▼         ▼              ▼              ▼                     │   │
│  │ WDK      Secondary     LP Adapter    Lending                    │   │
│  │ Adapter   Adapter     (StableSwap)  (Venus/Aave)               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
User deposit
    │
    ▼
OmniAgentVault.deposit()
    │ mints share tokens (ERC4626)
    ▼
StrategyEngine (checks cooldown, breaker, risk state)
    │
    ├─► LOW RISK  → deploy to WDK adapter (primary yield)
    ├─► MED RISK  → split WDK + LP + Lending
    └─► HIGH RISK → circuit breaker pauses, capital stays idle
    │
    ▼
Yield accrues via adapter.report() → vault.totalAssets updates
    │
    ▼
Cycle executes (auto or via ExecutionAuction winner)
    │ harvests yield, compounds, rebalances allocation
    ▼
ZKRiskOracle (Brevis ZK proof) → updated Sharpe + drawdown bands
    │
    ▼
Share price appreciates. User withdraws at new price.
```

---

## 3. Core Components

### 3.1 Why OmniAgent Wins

| Criteria | Description |
|----------|-------------|
| **Technical Correctness** | PolicyGuard middleware with hard limits enforced at code level |
| **Agent Autonomy** | Adaptive loop that dynamically schedules based on ZK-Risk level |
| **Economic Soundness** | X402 robot economy - AI pays AI using USDT |
| **Real-World Applicability** | True Multi-VM (BNB + Solana + TON) |

### 3.2 OmniAgentVault (ERC4626)

Non-custodial ERC4626 vault. Users deposit USDT, receive vault shares, earn yield proportional to their share.

**Key mechanisms:**
- **4-rail capital allocation**: WDK adapter, secondary adapter, LP adapter, lending adapter
- **Venus idle buffer**: Earns extra yield on idle capital via Venus
- **Transient reentrancy guard**: prevents reentrancy across external calls
- **Peg arb overlay**: integration with `PegArbExecutor` for depeg scenarios
- **Bounty system**: execution rewards funded from vault yield

### 3.2 StrategyEngine

Autonomous cycle execution brain. Reads on-chain price, volatility, and risk metrics to decide capital allocation.

**Decision logic:**
```
volatility > drawdownVolatility  → Drawdown state (conservative)
volatility > guardedVolatility   → Guarded state (moderate)
otherwise                        → Normal state (aggressive)
```

Each state maps to a different `targetWDKBps` / `targetLpBps` / `targetLendingBps` allocation defined in `RiskPolicy`.

### 3.3 RiskPolicy

Immutable parameters encoding the system's risk preferences. Set at deployment, cannot be changed.

**Allocations by state:**

| State     | WDK    | LP     | Lending |
|-----------|--------|--------|---------|
| Normal    | 100%   | 0%     | 0%      |
| Guarded   | 50%    | 25%    | 25%     |
| Drawdown  | 20%    | 40%    | 40%     |

### 3.4 ZKRiskOracle

ZK Coprocessor (Brevis) integration for cryptographically verified off-chain Monte Carlo simulations.

- Runs 10,000-path Monte Carlo on historical price data
- Outputs: Sharpe ratio, max drawdown, recommended buffer
- On-chain verification via SNARK proof before accepting results
- Defaults to 5% safety buffer if no proof submitted yet

### 3.5 CircuitBreaker

3-signal auto-pause mechanism. Trips on ANY signal breach. Recovers when ALL signals clear + cooldown elapsed.

| Signal | Source           | What it detects                        |
|--------|------------------|----------------------------------------|
| A      | Chainlink        | USDT/USD price deviation > threshold   |
| B      | StableSwap pool  | Reserve ratio deviation > threshold     |
| C      | Virtual price    | Virtual price drop > threshold          |

### 3.6 ExecutionAuction

Dutch auction for execution rights. Inverts bounty economics — searchers pay to execute, not the other way around.

**Phases:**
1. **Bid Phase** — searchers bid USDT for exclusive execution rights
2. **Execute Phase** — winner has exclusive rights for `executeWindow`
3. **Fallback Phase** — anyone can execute for free (liveness guarantee)

### 3.7 Adapters

| Adapter                   | Protocol          | Function                    |
|---------------------------|-------------------|-----------------------------|
| `WDKEarnAdapter`          | WDK Core          | Primary yield (swap to WDK, stake) |
| `WDKEarnAdapterWithSwap`  | WDK + DEX         | WDK earn with pre-swap      |
| `XAUTYieldAdapter`        | WDK XAUT          | Alternative asset yield      |
| `VenusYieldAdapter`       | Venus (BNB Chain) | Lending yield via vUSDT      |
| `AaveLendingAdapter`      | Aave              | Cross-chain lending exposure |
| `StableSwapLPYieldAdapterWithFarm` | StableSwap + Farm | LP + masterchef rewards |

### 3.8 Supporting Contracts

| Contract                  | Purpose                                   |
|---------------------------|-------------------------------------------|
| `SharpeTracker`           | EWMA-based Sharpe ratio calculation       |
| `RiskPolicy`              | Immutable risk parameters                 |
| `ChainlinkPriceOracle`    | Aggregated price feed (Chainlink)         |
| `MultiOracleAggregator`   | Multi-source price aggregation            |
| `PegArbExecutor`          | Depeg arbitrage trigger + execution        |
| `ERC4337SmartAccount`     | Smart contract wallet (Account Abstraction) |
| `GroupSyndicate`          | Multi-party coordination                  |

---

## 4. Backend API

### 4.1 Stack

| Layer        | Technology                          |
|--------------|-------------------------------------|
| Runtime      | Node.js 20 (Docker)                  |
| HTTP         | Hono + `@hono/node-server`          |
| Language     | TypeScript                          |
| Blockchain   | ethers.js v6                        |
| AI           | OpenRouter (Gemini, DeepSeek)       |
| Payments     | X402 (AI-pays-AI sub-agents)        |
| Protocol     | MCP (Model Context Protocol)        |
| Multi-VM     | BNB Chain, Solana, TON              |
| Deployment   | Docker + Railway (Backend) + Vercel (Frontend) |

### 4.2 Endpoints

| Method | Path                     | Description                        |
|--------|--------------------------|------------------------------------|
| GET    | `/health`                | Health check                       |
| GET    | `/api/stats`             | Vault stats, risk, system state    |
| POST   | `/api/mcp`               | MCP JSON-RPC (45+ tools)           |
| POST   | `/api/chat`              | AI chat with tool execution        |
| GET    | `/api/dashboard/events`   | SSE — autonomous loop events       |
| GET    | `/api/robot-fleet/status` | Robot fleet status                 |
| GET    | `/api/robot-fleet/events` | SSE — robot events                 |
| POST   | `/api/x402/*`            | X402 payment endpoints             |

### 4.3 MCP Tools (45+)

| Category  | Count | Examples                              |
|-----------|-------|---------------------------------------|
| X402      | 5     | Pay sub-agent, fleet status           |
| WDK Vault | 6     | Deposit, withdraw, balance, state     |
| WDK Engine| 3     | Execute cycle, risk metrics           |
| Aave      | 1     | Get position (mock)                   |
| Bridge    | 1     | Get quote (mock)                      |
| BNB       | 7     | Wallet, transfer, swap, bridge        |
| Solana    | 4     | Wallet, transfer, swap                |
| TON       | 3     | Wallet, transfer                      |
| ERC4337   | 12+   | Smart account management              |
| Robot Fleet| 4    | Status, start, events, robots         |

### 4.4 Agent Loop

```
┌─────────────────────────────────────────┐
│         AutonomousLoop (Hono)           │
│                                         │
│  1. Check risk (PolicyGuard)            │
│     └─► HIGH → sleep, retry later       │
│                                         │
│  2. Evaluate cycle (StrategyEngine)     │
│     └─► Not executable → sleep          │
│                                         │
│  3. Pay for data (X402 if needed)       │
│     └─► 0.1 USDT for price/risk data    │
│                                         │
│  4. Execute via WDKExecutor             │
│     └─► Chain tx, wait for receipt      │
│                                         │
│  5. Report to vault (adapter.report)    │
│     └─► Yield accrued to share price    │
│                                         │
│  6. Log + SSE broadcast                  │
│     └─► Dashboard updates live           │
└─────────────────────────────────────────┘
```

### 4.5 PolicyGuard

Middleware enforcing hard limits on every transaction before execution:

1. **Whitelist check** — sender must be authorized
2. **Volume check** — amount within per-tx limit
3. **Value check** — total value within per-day limit
4. **Cooldown check** — respecting cycle cooldown
5. **Risk check** — risk level within allowed threshold

Any failure → transaction blocked, feedback sent to LLM.

---

## 5. Deployment

### 5.1 Networks

| Network       | Chain ID | RPC                        |
|---------------|----------|----------------------------|
| BNB Testnet   | 97       | `https://bsc-testnet-dataseed.bnbchain.org` |
| BNB Mainnet   | 56       | User-configured            |

### 5.2 Testnet Contract Addresses

| Contract              | Address                                    |
|-----------------------|--------------------------------------------|
| **WDK Vault**         | `0xcB411a907e47047da98B38C99A683c6FAF2AA87A` |
| **WDK Engine**        | `0x0b33c994825c88484387E73D1F75967CeE79Cf25` |
| **USDT Token**        | `0xdea54eC5150Aa35ef2686b02EdD20b050430Ad7D` |
| **XAUT Token**        | `0x3CfeB85C9E4063c622255FD216055bF3058eb32e` |
| **ZK Risk Oracle**    | `0x6270359cBb1EB483f9630712e9D101845D39d524` |
| **USDT Oracle**       | `0xC3D519Ed04E55BFe67732513109bBBF6c959471D` |
| **XAUT Oracle**       | `0x9Da68499a9B4acB7641f3CBBd2f4F51062D6b57B` |
| **Circuit Breaker**   | `0x03408d440E2d9cd31D744469f111AaaBb121A844` |
| **XAUT Adapter**      | `0x06C390c4a68A9289Ba3366d6f023907970421120` |
| **Secondary Adapter**  | `0x759ae06e462Ac0000D0A34578dF0A15fC390cDd6` |
| **LP Adapter**        | `0xc3704bdbBe7E3c51180Bc219629E36a21795f7e0` |
| **Lending Adapter**   | `0x4774285a7Cd9711Ae396e1EDD0Bcf6d093bEa1bb` |
| **MockAavePool**      | `0xa9B209611603CE09bEbCFF63a1A3d44D0C4A6f48` |
| **MockBridge**        | `0x8c3E36830eD27759C0f65A665D067Fe77041aa0C` |
| **aUSDT (aToken)**    | `0xddfAe15c7f1DB6d1e10a3d8bAEA62a2948648ebD` |

View all on BSCScan: `https://testnet.bscscan.com/address/0xcB411a907e47047da98B38C99A683c6FAF2AA87A`

### 5.3 Infrastructure

| Component    | Platform     | URL                              |
|--------------|--------------|----------------------------------|
| Backend API  | Railway/Docker | `omniagent-production.up.railway.app` |
| Frontend     | Vercel       | `omni-wdk.vercel.app`            |
| API Docs     | —            | `https://omniagent-production.up.railway.app/api/stats` |

---

## 6. Environment Variables

### Backend (Railway)

| Variable                  | Required | Default | Description                    |
|---------------------------|----------|---------|--------------------------------|
| `WDK_SECRET_SEED`         | Yes      | —       | BIP-39 mnemonic seed phrase    |
| `OPENROUTER_API_KEY`      | Yes      | —       | OpenRouter API key             |
| `BNB_RPC_URL`             | Yes      | testnet | BNB Chain RPC URL              |
| `PORT`                    | No       | 3001    | Server port                    |
| `SOLANA_RPC_URL`          | No       | —       | Solana RPC URL                 |
| `TON_RPC_URL`             | No       | —       | TON RPC URL                    |
| `OPENROUTER_MODEL_GENERAL`| No      | gemini-2.0-flash | General LLM model      |
| `OPENROUTER_MODEL_CRYPTO` | No       | deepseek-chat | Crypto LLM model        |
| `WDK_VAULT_ADDRESS`        | No       | —       | Vault contract address         |
| `WDK_ENGINE_ADDRESS`      | No       | —       | Engine contract address        |
| `WDK_ZK_ORACLE_ADDRESS`    | No       | —       | ZK oracle contract address     |

### Frontend (Vercel)

| Variable                    | Required | Default | Description              |
|-----------------------------|----------|---------|--------------------------|
| `VITE_DEFAULT_NETWORK`      | Yes      | testnet | Network mode             |
| `VITE_API_URL`              | Yes      | localhost | Backend API URL         |
| `VITE_WALLETCONNECT_PROJECT_ID` | No   | —       | WalletConnect project ID |

**OmniAgent: Where robots manage robots' money.**

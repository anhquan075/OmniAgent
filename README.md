<p align="center">
  <a href="https://dorahacks.io/hackathon/casper-agentic-buildathon/detail">
    <img src="frontend/public/imgs/logo.png" alt="OmniAgent Casper proof console" width="460" />
  </a>
</p>

<p align="center">
  <a href="frontend/public/imgs/omniagent-mascot.png"><img alt="OmniAgent ghost mascot" src="frontend/public/imgs/omniagent-mascot.png" width="26" /></a>
  <a href="https://dorahacks.io/hackathon/casper-agentic-buildathon/detail"><img alt="Casper Agentic Buildathon" src="https://img.shields.io/badge/Casper-Agentic%20Buildathon-D7352E?logo=casper&logoColor=white" /></a>
  <a href="contracts/casper-decision-proof"><img alt="Native Casper contract" src="https://img.shields.io/badge/Contract-Native%20Casper%20Rust-2B6CB0?logo=rust&logoColor=white" /></a>
  <a href="https://testnet.cspr.live/contract/5a82529f9ba05e716933384ddc9862710ba9a0fd3a7347ab1e8c6e60b1a4c861"><img alt="Casper Testnet proof" src="https://img.shields.io/badge/Testnet-Casper%20Proof-D7352E" /></a>
</p>

# OmniAgent Casper

OmniAgent Casper is a verifiable AI agent for **RWA collateral risk decisions**
on Casper Testnet. It answers a practical financing question:

> Should this tokenized collateral remain financeable after fresh public market
> evidence changes its risk profile?

The project exists because DeFi credit and RWA financing workflows need more
than an AI recommendation. They need a replayable trail: source evidence,
agent reasoning, deterministic policy gates, a Casper transaction, contract
readback, and a public verifier that does not require private keys or internal
operator access.

OmniAgent reads public RWA evidence, runs a proposer/critic/policy-gate agent
loop, writes a decision receipt to a native Casper Rust contract, and exposes
the receipt through a dashboard, public proof endpoint, and verifier script.
It is built as a Casper-only demo for the
[Casper Agentic Buildathon](https://dorahacks.io/hackathon/casper-agentic-buildathon/detail).

![OmniAgent Casper architecture](frontend/public/imgs/omniagent-casper-architecture.png)

## High-Level Design

1. Public RWA evidence is normalized into a source hash and risk score.
2. The agent runtime proposes an action, critiques it, and applies a deterministic policy gate.
3. FastAPI exposes the Casper MCP tools, dashboard API, public proof API, and verifier inputs.
4. The Casper Testnet contract stores the latest proof digest and per-decision receipt.
5. The dashboard and verifier replay the receipt path without exposing signer paths, operator tokens, or raw runtime logs.

- **Backend runtime:** `fastapi-casper-agent`
- **MCP tool family:** `casper_*`
- **On-chain component:** [contracts/casper-decision-proof](contracts/casper-decision-proof)
- **Frontend:** a Casper proof cockpit for decision traces, policy gates, deploy status, readback checks, judge packet, and recovery actions

## Safety Model (Dry Run vs Live Submit)

Live Casper submission is **off by default**.

## Autonomous Agent Loop

The agent can run autonomously — continuously fetching live RWA evidence and
writing Casper decision receipts every N seconds without manual intervention.

Enable the loop via environment variables:

```bash
CASPER_AGENT_LOOP_ENABLED=true \
CASPER_AGENT_LOOP_INTERVAL_SEC=60 \
CASPER_AGENT_LOOP_DRY_RUN=true \
rtk uv --project backend run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

- `CASPER_AGENT_LOOP_ENABLED` — starts the background asyncio loop on boot
- `CASPER_AGENT_LOOP_INTERVAL_SEC` — seconds between cycles (default: 60)
- `CASPER_AGENT_LOOP_DRY_RUN` — if true, writes local ledger entries only; if false, submits live Casper transactions (requires `CASPER_LIVE_SUBMIT_ENABLED=true`)

The loop fetches live US Treasury 10-Year yield from the public fiscaldata.treasury.gov API, falling back to a static fixture if the API is unreachable. Loop status is visible in the dashboard and via `GET /api/dashboard/loop`.

- Dry runs are safe and write decisions into the dashboard decision log.
- Live submission is allowed only when all runtime proof gates pass and live-submit is explicitly enabled.
- Configured live submission runs `casper-client`, probes Casper state, captures a Casper Testnet transaction hash, and records it in the dashboard proof log.
- When live submit returns a deploy hash, the loop can poll confirmation and attach readback evidence automatically.

Live mode requires:

1. A funded Casper Testnet account
2. A signer path outside git
3. Deployed decision contract hash and package hash
4. `casper-client` available on PATH or via `CASPER_CLIENT_PATH`
5. The explicit live-submit command flag

## Full Casper Network Integration

OmniAgent is discoverable and independently verifiable as a Casper network agent:

- Public agent card: `GET /.well-known/casper-agent-card.json`
- Dashboard/API actions: `POST /api/cycle/run`, `POST /api/loop/start`, `POST /api/loop/stop`, and `POST /api/readback/record`
- Read-only JSON-RPC fallback for state root, `latest_proof_digest`, and decision receipt reads when `casper-client` is unavailable
- Optional CSPR.cloud REST probe for account balance, plus latest block height when used as the fallback probe
- Autonomous loop path: submit -> poll deploy status -> read contract state -> verify digest and receipt
- Additive contract query entry point: `get_decision_receipt(decision_id: String) -> String`

Signing and submission still require `casper-client`; JSON-RPC and CSPR.cloud are read-only support paths.

## Quick Start

### 1) Install dependencies

```bash
pnpm install
rtk uv sync --project backend --group dev
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 2) Start backend (safe mode)

```bash
OMNIAGENT_SKIP_ENV_FILE=true \
CASPER_LIVE_SUBMIT_ENABLED=false \
rtk uv --project backend run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 3) Start frontend

```bash
rtk pnpm -C frontend run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Runtime Overview

| Item | Value |
|------|-------|
| Network | Casper Testnet |
| Contract | [casper-decision-proof](contracts/casper-decision-proof) |
| Adapter | `fastapi-casper-agent` |
| MCP tools | `casper_agent_cockpit_snapshot`, `casper_get_account`, `casper_runtime_snapshot`, `casper_live_preflight`, `casper_run_autonomous_cycle`, `casper_live_proof_bundle`, `casper_get_deploy_status`, `casper_get_decision_receipt`, `casper_verify_decision_receipt`, `casper_record_decision`, `casper_record_readback` |
| Explorer | `https://testnet.cspr.live` |
| Decision log | Dashboard receipt stream via `/api/dashboard/receipts` |

## Contract Source

- [Casper decision proof contract source](contracts/casper-decision-proof)
- [Contract build and entrypoint notes](contracts/casper-decision-proof/README.md)
- Dashboard contract links: set `CASPER_DECISION_CONTRACT_HASH` and `CASPER_DECISION_CONTRACT_PACKAGE_HASH` to embed Casper Testnet contract/package links in the proof console.

## Buildathon Technology Stack

Only claim stack items backed by code or verifier evidence:

| Stack item | Status | Evidence |
|------|------|------|
| Native Casper Rust SDK | Used | Contract uses `casper-contract` and `casper-types` in `contracts/casper-decision-proof`. |
| Casper MCP Server | Used as local MCP tool surface | Backend exposes the `casper_*` tool family through the project MCP route. |
| JavaScript/TypeScript SDK | Used for frontend, not Casper JS SDK | Vite/React/TypeScript proof cockpit in `frontend/`. |
| Python SDK | Used for backend runtime, not Casper Python SDK | FastAPI backend, JSON-RPC probes, and `casper-client` orchestration in `backend/`. |
| x402 Facilitator | Readiness only | `CASPER_X402_EVIDENCE_URL` and `CASPER_X402_RECEIPT` fail closed unless real endpoint and receipt exist. |
| Odra Framework | Not used | Contract is native Casper Rust, not Odra. |
| CSPR.cloud | Optional REST integration | Used when `CASPER_CSPR_CLOUD_API_KEY` is set for account balance and fallback block-height probes. |
| CSPR.click / CSPR.trade | Not used | No production dependency or live integration is claimed. |

## Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `CASPER_NETWORK` | Casper network name (default: `casper-test`) |
| `CASPER_RPC_URL` | Casper RPC endpoint |
| `CASPER_NODE_ADDRESS` | Optional Casper client node address; falls back to `CASPER_RPC_URL` |
| `CASPER_ACCOUNT_PUBLIC_KEY` | Funded Casper Testnet account public key |
| `CASPER_SECRET_KEY_PATH` | Local signer path (must stay outside git) |
| `CASPER_DECISION_CONTRACT_HASH` | Deployed decision contract hash |
| `CASPER_DECISION_CONTRACT_PACKAGE_HASH` | Deployed decision contract package hash |
| `CASPER_LIVE_SUBMIT_ENABLED` | Enables guarded live-submit prerequisite validation |
| `CASPER_CLIENT_PATH` | Casper CLI binary, default `casper-client` |
| `CASPER_TRANSACTION_COMMAND` | Casper CLI decision-call command, default `put-deploy` |
| `CASPER_TRANSACTION_WASM_PATH` | Optional compiled Wasm path for contract install/session mode |
| `CASPER_DECISION_LEDGER_PATH` | Optional runtime backing store for the dashboard decision log |
| `CASPER_AGENT_LOOP_AUTO_READBACK` | Enables best-effort deploy polling and readback after loop submits |
| `CASPER_AGENT_LOOP_POLL_MAX_RETRIES` | Max deploy-status polling attempts after submit |
| `CASPER_CSPR_CLOUD_API_KEY` | Optional CSPR.cloud API key for balance and fallback block-height probes |
| `CASPER_MIN_BALANCE_CSPR` | Warning threshold for low CSPR account balance |
| `CASPER_X402_EVIDENCE_URL` | Optional real x402 evidence endpoint |
| `CASPER_X402_RECEIPT` | Optional x402 receipt metadata; leave empty rather than faking receipts |

## Verification

Run the full buildathon stack verifier when you need a release-quality check:

```bash
scripts/verify-casper-buildathon-stack.sh
```

It validates backend compile/tests, contract check/release build, frontend unit/e2e tests/build, safe backend boot, dashboard proof APIs, readiness, dry-run MCP decision cycle, and tracked-source secret hygiene.

Verify a single receipt without `casper-client`:

```bash
scripts/verify-casper-receipt.sh <decision_id> --use-rpc
```

Build the Casper contract directly:

```bash
cargo +nightly-2025-03-01 build --manifest-path contracts/casper-decision-proof/Cargo.toml --release --target wasm32v1-none
```

## Casper Testnet & Blockchain Links

| Item | Link |
|------|------|
| Casper Testnet explorer | [testnet.cspr.live](https://testnet.cspr.live/) |
| Casper Testnet RPC | [node.testnet.casper.network/rpc](https://node.testnet.casper.network/rpc) |
| Decision contract | [5a82529f9ba05e716933384ddc9862710ba9a0fd3a7347ab1e8c6e60b1a4c861](https://testnet.cspr.live/contract/5a82529f9ba05e716933384ddc9862710ba9a0fd3a7347ab1e8c6e60b1a4c861) |
| Contract package | [46cf57541f04df822b160dd0e47a8425ec94c310e54a6dda862c46f9b4930bea](https://testnet.cspr.live/contract-package/46cf57541f04df822b160dd0e47a8425ec94c310e54a6dda862c46f9b4930bea) |
| Contract install deploy | [0444471ab96e840e25d69f525341ee95f014137ebda3e3c0a838eb46b31267f1](https://testnet.cspr.live/deploy/0444471ab96e840e25d69f525341ee95f014137ebda3e3c0a838eb46b31267f1) |
| Demo decision deploy | [ddef65a6d533eecd4c4721a3cb8792c73bb483e2068a03b5a2d86022828a9736](https://testnet.cspr.live/deploy/ddef65a6d533eecd4c4721a3cb8792c73bb483e2068a03b5a2d86022828a9736) |
| Contract source | [contracts/casper-decision-proof](contracts/casper-decision-proof) |
| Receipt verifier | [scripts/verify-casper-receipt.sh](scripts/verify-casper-receipt.sh) |

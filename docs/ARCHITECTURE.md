# Casper Architecture

OmniAgent runs as a single Casper runtime:

- `backend/app/services/casper/` owns account readiness, preflight gates, decision payloads, local decision ledger writes, proof bundle scoring, and runtime snapshots.
- `backend/app/services/adapters/runtime.py` registers only `fastapi-casper-agent`.
- `backend/app/services/mcp/tools.py` exposes only `casper_*` MCP tools.
- `backend/app/api/routes/dashboard.py` returns a Casper snapshot with `casperAgentRuntime`, `casperProofBundle`, and `backendHealth`.
- `frontend/src/components/dashboard/` renders the Casper cockpit and proof panel.

Technology stack boundary:

- The smart contract uses native Casper Rust crates: `casper-contract` and `casper-types`.
- The backend is Python/FastAPI and orchestrates Casper JSON-RPC plus `casper-client`.
- The frontend is TypeScript/React.
- The MCP surface is project-owned `casper_*` tooling, not a broad multi-chain adapter.
- Odra, CSPR.click, CSPR.cloud, CSPR.trade, and live x402 facilitator flows are not claimed unless added with real integrations.

## Proof Flow

1. Build a deterministic decision payload with a rationale hash and proof digest.
2. Run Casper preflight checks for account, signer, contract hash, package hash, payment cap, balance reserve, and live-submit flag.
3. Append dry-run events to the Casper decision ledger, or pass exact chain replay checks, an atomic SQLite intent lock, cooldown, daily budget, and single-flight submission before invoking `casper-client`.
4. Capture the Casper transaction hash and refresh deploy status when requested.
5. Score the proof bundle from latest decision, deploy status, readback status, and hard blockers.
6. Render proof state and recovery actions in the frontend cockpit.

The default stored-contract `put-deploy --session-hash` path does not require a
transaction Wasm file. Live submit remains blocked until explicit account,
signer, contract, Casper CLI, balance, payment, persistence, replay-guard, and
command-acknowledgement gates pass. The experimental `put-txn` path is blocked
from live submission until its pricing is budgeted independently.

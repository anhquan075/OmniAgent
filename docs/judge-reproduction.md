# Judge Reproduction Guide

This guide reproduces OmniAgent Casper locally without spending CSPR, then
documents the optional owner-only path for exactly one guarded Casper Testnet
canary. The default path never broadcasts a transaction.

## 1. Prerequisites

Install:

- Git, `curl`, `jq`, and `rg`
- Python 3.11 and [uv](https://docs.astral.sh/uv/)
- Node.js 22, Corepack, and pnpm
- Rustup/Cargo for the contract build
- Chromium for the optional Playwright test

The live canary additionally requires `casper-client` 5.0.1, a funded Casper
Testnet account, a signer file outside git, and deployed contract/package
hashes. Do not share or commit the signer.

## 2. Clone and install

```bash
git clone https://github.com/anhquan075/OmniAgent.git
cd OmniAgent

uv sync --project backend --group dev
corepack enable
pnpm -C frontend install --frozen-lockfile

rustup toolchain install nightly-2025-03-01
rustup target add wasm32v1-none --toolchain nightly-2025-03-01
pnpm -C frontend exec playwright install chromium
```

## 3. Run the complete release gate

```bash
scripts/verify-casper-buildathon-stack.sh
```

This runs backend tests and compilation, the native Casper contract check and
release build, frontend tests/build/E2E, safe backend boot, a no-submit cycle,
public-proof assertions, and tracked-source secret checks.

Expected final line:

```text
[casper] ok
```

The contract Wasm is written under
`contracts/casper-decision-proof/target/wasm32v1-none/release/`.

The same core gates can be run separately:

```bash
uv run --project backend pytest -q backend/tests
uv run --project backend ruff check backend/app backend/tests
uv run --project backend python -m compileall -q backend/app backend/tests

cargo +nightly-2025-03-01 check \
  --manifest-path contracts/casper-decision-proof/Cargo.toml \
  --target wasm32v1-none
cargo +nightly-2025-03-01 build \
  --manifest-path contracts/casper-decision-proof/Cargo.toml \
  --release \
  --target wasm32v1-none

pnpm -C frontend test -- --run
pnpm -C frontend run build
```

## 4. Start the app in zero-spend mode

Terminal 1, from the repository root:

```bash
cd backend
env \
  OMNIAGENT_SKIP_ENV_FILE=true \
  API_SESSION_SECRET=judge-local-session-secret \
  API_OPERATOR_TOKEN=judge-local-operator \
  CASPER_LIVE_SUBMIT_ENABLED=false \
  CASPER_AGENT_LOOP_ENABLED=false \
  CASPER_AGENT_LOOP_DRY_RUN=true \
  CASPER_AGENT_LOOP_LIVE_SUBMIT_ENABLED=false \
  CASPER_DECISION_LEDGER_PATH=/tmp/omniagent-judge.sqlite3 \
  uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Terminal 2, from the repository root:

```bash
VITE_API_URL=http://127.0.0.1:8000 pnpm -C frontend run dev
```

Open <http://127.0.0.1:5173>. The public frontend is a read-only proof console;
operator mutations use the authenticated API/CLI path below.

Check health and the anonymous security boundary:

```bash
curl -fsS http://127.0.0.1:8000/api/health | jq
curl -fsS http://127.0.0.1:8000/api/session | jq '{operator,expiresAt}'
```

Expected: health is `ok`, `liveSubmitEnabled` is `false`, and the anonymous
session has `operator: false`.

## 5. Run one local dry cycle

Terminal 3, from the repository root:

```bash
PYTHONPATH=backend uv run --project backend python \
  backend/scripts/run-casper-decision-cycle.py \
  --api-url http://127.0.0.1:8000 \
  --operator-token judge-local-operator \
  --decision-id judge-dry-run-001 \
  --dry-run \
  --write-proof /tmp/omniagent-judge-proof.json
```

Inspect the public packet:

```bash
curl -fsS http://127.0.0.1:8000/api/public/proof \
  | jq '{status,decisionId,deployHash,readback,hardBlockers}'
```

Expected:

- `status` is `dry_run` or `dry_run_blocked` with explicit missing-live-config
  blockers.
- No deploy/transaction hash is present.
- A deterministic local decision/proof receipt is present.
- No Casper transaction is created and no CSPR is spent.

Inspect the recorded loop output with a normal dashboard session:

```bash
COOKIE_JAR=/tmp/omniagent-judge.cookies
curl -fsS -c "$COOKIE_JAR" http://127.0.0.1:8000/api/session >/dev/null
curl -fsS -b "$COOKIE_JAR" \
  'http://127.0.0.1:8000/api/dashboard/cycles?limit=8' \
  | jq '{count,total,cycles:[.cycles[] | {cycleId,status,decisionId,tools:.bundle.cycle.toolActivity}]}'
```

Open the Cockpit and use **Select autonomous loop cycle** to switch between
recorded attempts. The MCP activity and AI output panels are pinned to the same
cycle until **Latest live cycle** is selected again.

## 6. Replay public on-chain proof

The deployed proof surfaces require no private key:

```bash
curl -fsS https://omniagent-production.up.railway.app/api/public/proof \
  | jq '{status,decisionId,deployHash,contractHash,readback}'

curl -fsS \
  https://omniagent-production.up.railway.app/.well-known/casper-agent-card.json \
  | jq '{name,network,contractHash,contractPackageHash}'
```

For a decision ID shown by the public proof endpoint:

```bash
CASPER_DECISION_CONTRACT_HASH=<contract-hash> \
scripts/verify-casper-receipt.sh <decision-id> \
  --api-url https://omniagent-production.up.railway.app \
  --use-rpc
```

Expected: the local/public receipt matches the Casper Testnet dictionary value.

## 7. Optional owner-only: one 2.5 CSPR canary

Skip this section unless you control the funded Testnet account. Before
starting, require a balance of at least 52.5 CSPR: the 2.5 CSPR offered payment
plus the protected 50 CSPR reserve.

Start a separate backend with these additional values:

```bash
cd backend
env \
  OMNIAGENT_SKIP_ENV_FILE=true \
  API_SESSION_SECRET="$API_SESSION_SECRET" \
  API_OPERATOR_TOKEN="$API_OPERATOR_TOKEN" \
  CASPER_NETWORK=casper-test \
  CASPER_RPC_URL=https://node.testnet.casper.network/rpc \
  CASPER_ACCOUNT_PUBLIC_KEY="$CASPER_ACCOUNT_PUBLIC_KEY" \
  CASPER_SECRET_KEY_PATH="$CASPER_SECRET_KEY_PATH" \
  CASPER_DECISION_CONTRACT_HASH="$CASPER_DECISION_CONTRACT_HASH" \
  CASPER_DECISION_CONTRACT_PACKAGE_HASH="$CASPER_DECISION_CONTRACT_PACKAGE_HASH" \
  CASPER_CLIENT_PATH=casper-client \
  CASPER_LIVE_SUBMIT_ENABLED=true \
  CASPER_PAYMENT_AMOUNT_MOTES=2500000000 \
  CASPER_MIN_PAYMENT_AMOUNT_MOTES=2500000000 \
  CASPER_AGENT_LOOP_ENABLED=false \
  CASPER_AGENT_LOOP_DRY_RUN=true \
  CASPER_AGENT_LOOP_LIVE_SUBMIT_ENABLED=false \
  CASPER_LIVE_MIN_SUBMIT_INTERVAL_SEC=21600 \
  CASPER_LIVE_MAX_SUBMISSIONS_PER_UTC_DAY=4 \
  CASPER_LIVE_DAILY_BUDGET_MOTES=10000000000 \
  CASPER_MIN_BALANCE_CSPR=50 \
  CASPER_DECISION_LEDGER_PATH="$CASPER_DECISION_LEDGER_PATH" \
  uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Keep all recurring-loop flags in the safe state shown above. Confirm readiness:

```bash
PYTHONPATH=backend uv run --project backend python \
  backend/scripts/check-casper-testnet-readiness.py \
  --api-url http://127.0.0.1:8000
```

Proceed only when readiness reports zero errors. Submit exactly once:

```bash
PYTHONPATH=backend uv run --project backend python \
  backend/scripts/run-casper-decision-cycle.py \
  --api-url http://127.0.0.1:8000 \
  --operator-token "$API_OPERATOR_TOKEN" \
  --i-understand-this-submits-casper-testnet
```

The service replaces the process-local decision ID with a semantic ID, checks
that exact contract dictionary key, atomically reserves the intent in SQLite,
enforces the cooldown/count/budget/reserve, and only then invokes
`casper-client put-deploy` with `2500000000` motes.

Fetch the resulting semantic ID and deploy hash:

```bash
curl -fsS http://127.0.0.1:8000/api/public/proof \
  | jq '{decisionId,deployHash,status}'
```

After the deploy confirms, create an operator session and record readback:

```bash
COOKIE_JAR=/tmp/omniagent-operator.cookies
SESSION_JSON="$(curl -fsS -c "$COOKIE_JAR" \
  -H "X-Operator-Token: $API_OPERATOR_TOKEN" \
  http://127.0.0.1:8000/api/session)"
CSRF_TOKEN="$(printf '%s' "$SESSION_JSON" | jq -r .csrfToken)"
DECISION_ID="$(curl -fsS http://127.0.0.1:8000/api/public/proof | jq -r .decisionId)"
DEPLOY_HASH="$(curl -fsS http://127.0.0.1:8000/api/public/proof | jq -r .deployHash)"

curl -fsS -b "$COOKIE_JAR" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"decisionId\":\"$DECISION_ID\",\"deployHash\":\"$DEPLOY_HASH\"}" \
  http://127.0.0.1:8000/api/readback/record \
  | jq '{status,verified,hardBlockers}'
```

Retry readback only while the deploy is pending. Completion requires
`status: verified` and `verified: true`. Then export a fresh packet:

```bash
curl -fsS http://127.0.0.1:8000/api/public/proof \
  | jq . > /tmp/omniagent-live-proof.json

scripts/verify-casper-live-proof.sh \
  --proof-file /tmp/omniagent-live-proof.json
```

Finally, stop that backend or restore `CASPER_LIVE_SUBMIT_ENABLED=false`. Do
not arm the autonomous loop merely to demonstrate the one-shot canary.

## 8. Railway production safety

A new or unverified production deployment should first boot with:

```text
CASPER_LIVE_SUBMIT_ENABLED=false
CASPER_PAYMENT_AMOUNT_MOTES=2500000000
CASPER_AGENT_LOOP_ENABLED=false
CASPER_AGENT_LOOP_DRY_RUN=true
CASPER_AGENT_LOOP_LIVE_SUBMIT_ENABLED=false
CASPER_LIVE_MIN_SUBMIT_INTERVAL_SEC=21600
CASPER_LIVE_MAX_SUBMISSIONS_PER_UTC_DAY=4
CASPER_LIVE_DAILY_BUDGET_MOTES=10000000000
CASPER_MIN_BALANCE_CSPR=50
CASPER_DECISION_LEDGER_PATH=/data/casper-decision-log.sqlite3
```

The current public deployment was subsequently armed at a guarded 1800-second
interval only after a 2.5-CSPR canary confirmed with matching contract receipt
readback. Keep the safe values above for judge reproduction and initial rollout;
arming recurring live submission is a separate owner-only production decision.

Use one backend replica with a volume mounted at `/data`. The SQLite guard is
the atomic cross-process budget/idempotency boundary for the currently deployed
contract; the semantic on-chain receipt probe is an additional fail-closed
replay check. See [railway-deployment.md](railway-deployment.md) for the full
rollout and rollback procedure.

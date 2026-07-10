# Railway Deployment

Deploy OmniAgent Casper as two Railway services from the same repository.

## Services

| Service | Root Directory | Config File Path | Public Domain |
| --- | --- | --- | --- |
| `backend` | `/backend` | `/backend/railway.json` | Yes |
| `frontend` | `/frontend` | `/frontend/railway.json` | Yes |

Railway config files are service-scoped. Set the config file path explicitly in each service settings page.

## Backend Variables

Set these on the backend service:

```bash
PORT=8000
CASPER_NETWORK=casper-test
CASPER_RPC_URL=https://node.testnet.casper.network/rpc
CASPER_RPC_TIMEOUT_SEC=10
CASPER_EXPLORER_URL=https://testnet.cspr.live
CASPER_ACCOUNT_PUBLIC_KEY=<funded-testnet-account>
CASPER_SECRET_KEY_PATH=<secret-path-outside-git>
CASPER_DECISION_CONTRACT_HASH=<deployed-contract-hash>
CASPER_DECISION_CONTRACT_PACKAGE_HASH=<deployed-package-hash>
CASPER_LIVE_SUBMIT_ENABLED=false
CASPER_PAYMENT_AMOUNT_MOTES=2500000000
CASPER_CLIENT_PATH=/usr/local/bin/casper-client
CASPER_AGENT_LOOP_ENABLED=false
CASPER_AGENT_LOOP_DRY_RUN=true
CASPER_AGENT_LOOP_INTERVAL_SEC=3600
CASPER_AGENT_LOOP_LIVE_SUBMIT_ENABLED=false
CASPER_LIVE_MIN_SUBMIT_INTERVAL_SEC=21600
CASPER_LIVE_MAX_SUBMISSIONS_PER_UTC_DAY=4
CASPER_LIVE_DAILY_BUDGET_MOTES=10000000000
CASPER_MIN_BALANCE_CSPR=50
CASPER_DECISION_LEDGER_PATH=/data/casper-decision-log.sqlite3
API_SESSION_SECRET=<sealed-secret>
API_OPERATOR_TOKEN=<sealed-secret>
API_TRUSTED_HOSTS=localhost,127.0.0.1,testserver,healthcheck.railway.app,*.up.railway.app,*.railway.internal
ALLOWED_FRONTEND_ORIGINS=https://<frontend-public-domain>.up.railway.app
```

The backend image installs `casper-client` 5.0.1 at `/usr/local/bin/casper-client`. Mount a backend volume at `/data`; the same SQLite file stores the dashboard log and the atomic submission budget/idempotency guard.

## Frontend Variables

Set this on the frontend service:

```bash
BACKEND_INTERNAL_URL=http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:${{backend.PORT}}
VITE_DEFAULT_NETWORK=casper-test
VITE_CASPER_EXPLORER_URL=https://testnet.cspr.live
```

The frontend serves browser traffic and proxies `/api/*` to `BACKEND_INTERNAL_URL` server-side.

## Post-Deploy Checks

```bash
curl https://<frontend-public-domain>.up.railway.app/api/health
```

Then call these MCP tools through the deployed frontend origin:

- `casper_get_account`
- `casper_live_preflight`
- `casper_live_proof_bundle`

Before any restart, require `CASPER_LIVE_SUBMIT_ENABLED=false`, `CASPER_AGENT_LOOP_ENABLED=false`, `CASPER_AGENT_LOOP_DRY_RUN=true`, and `CASPER_AGENT_LOOP_LIVE_SUBMIT_ENABLED=false`. Keep them there until a single manual 2.5-CSPR canary is confirmed and read back. Existing Railway variables override code defaults; change or remove the old `25000000000`, five-minute interval, and live-loop values before redeploying.

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
CASPER_CLIENT_PATH=/usr/local/bin/casper-client
CASPER_DECISION_LEDGER_PATH=railway-casper-dashboard-log
API_SESSION_SECRET=<sealed-secret>
API_OPERATOR_TOKEN=<sealed-secret>
API_TRUSTED_HOSTS=localhost,127.0.0.1,testserver,healthcheck.railway.app,*.up.railway.app,*.railway.internal
ALLOWED_FRONTEND_ORIGINS=https://<frontend-public-domain>.up.railway.app
```

The backend image installs `casper-client` 5.0.1 at `/usr/local/bin/casper-client`. The dashboard decision log is rendered through the API and does not require a checked-in proof artifact.

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
- `casper_record_decision`

Keep `CASPER_LIVE_SUBMIT_ENABLED=false` until the Casper account, signer, contract, deploy receipt, readback proof, and deploy writer are verified.

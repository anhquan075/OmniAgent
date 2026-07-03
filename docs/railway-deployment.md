# Railway Deployment

This guide documents the Railway deployment shape for OmniAgent Casper.

The app should run as **two Railway services** in one Railway project:

| Service | Root directory | Public? | Purpose |
|---------|----------------|---------|---------|
| `backend` | `backend` | Yes for public proof endpoints; private is enough for dashboard-only use | FastAPI Casper runtime, MCP tools, autonomous loop, public proof API, Casper readback |
| `frontend` | `frontend` | Yes | React proof cockpit served by the Node static/proxy server |

No separate worker, database, or Casper CLI service is required. The backend Docker image installs `casper-client` and the autonomous loop runs inside the backend process. Add a backend volume only when the deployment needs restart-stable decision history or a signer file path.

## Railway Settings

Create both services from the same GitHub repo and set each service root directory explicitly:

1. Create the `backend` service with root directory `backend`.
2. Create the `frontend` service with root directory `frontend`.
3. Keep both services in the same Railway environment so private networking works.
4. Generate a public domain for the frontend.
5. Generate a public domain for the backend if judges or verifiers must fetch `/.well-known/casper-agent-card.json` or `/api/public/proof` directly.

Railway will use each service's local `railway.json`:

| Service | Builder | Dockerfile | Healthcheck | Replica count |
|---------|---------|------------|-------------|---------------|
| `backend` | `DOCKERFILE` | `backend/Dockerfile` | `/api/health` | 1 |
| `frontend` | `DOCKERFILE` | `frontend/Dockerfile` | `/` | 1 |

The containers use Railway's provided `PORT` at runtime. Do not hardcode a public port in Railway; the Dockerfiles only provide local fallbacks.

## Network Topology

Browser requests should hit the frontend service. The frontend serves static assets and proxies `/api/*` to the backend through `BACKEND_URL` or `BACKEND_INTERNAL_URL`.

Recommended frontend variable:

```bash
BACKEND_URL=http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8000
```

If the service is not named `backend`, replace `backend` with the actual Railway service name, or use:

```bash
BACKEND_URL=http://<backend-service-name>.railway.internal:8000
```

The frontend does not proxy `/.well-known/casper-agent-card.json`, so expose the backend publicly when the agent card must be reachable by external reviewers.

## Backend Variables

Set these on the `backend` service.

### Required for all deployments

| Variable | Value |
|----------|-------|
| `OMNIAGENT_LOG_JSON` | `true` |
| `OMNIAGENT_LOG_STREAM` | `stdout` |
| `API_SESSION_SECRET` | Long random secret, sealed if possible |
| `API_OPERATOR_TOKEN` | Optional. Leave empty for the demo dashboard controls, or set only when using an operator client that sends `X-Operator-Token` to `/api/session` |
| `API_SECURITY_ENABLED` | `true` |
| `API_SECURITY_HEADERS_ENABLED` | `true` |
| `API_RATE_LIMIT_ENABLED` | `true` |
| `API_TRUSTED_HOSTS` | `localhost,127.0.0.1,testserver,healthcheck.railway.app,*.up.railway.app,*.railway.internal` plus any custom backend domain |
| `ALLOWED_FRONTEND_ORIGINS` | Frontend public URL, for example `https://<frontend>.up.railway.app` |
| `AGENT_RUNTIME_ADAPTER` | `fastapi-casper-agent` |
| `MCP_ALLOWED_TOOLS` | `casper_agent_cockpit_snapshot,casper_get_account,casper_runtime_snapshot,casper_live_preflight,casper_run_autonomous_cycle,casper_live_proof_bundle,casper_get_deploy_status,casper_get_decision_receipt,casper_verify_decision_receipt,casper_record_decision,casper_record_readback` |

### Required Casper Testnet identity

| Variable | Value |
|----------|-------|
| `CASPER_NETWORK` | `casper-test` |
| `CASPER_RPC_URL` | `https://node.testnet.casper.network/rpc` |
| `CASPER_NODE_ADDRESS` | `https://node.testnet.casper.network/rpc` |
| `CASPER_EXPLORER_URL` | `https://testnet.cspr.live` |
| `CASPER_DECISION_CONTRACT_HASH` | Deployed decision contract hash |
| `CASPER_DECISION_CONTRACT_PACKAGE_HASH` | Deployed package hash |
| `CASPER_CLIENT_PATH` | `/usr/local/bin/casper-client` |
| `CASPER_TRANSACTION_COMMAND` | `put-deploy` |
| `CASPER_TRANSACTION_ENTRY_POINT` | `record_decision` |
| `CASPER_PAYMENT_AMOUNT_MOTES` | `25000000000` |
| `CASPER_GAS_PRICE_TOLERANCE` | `10` |

### Safe demo mode

Use this mode when you want Railway to show the dashboard and autonomous receipts without submitting Casper transactions:

| Variable | Value |
|----------|-------|
| `CASPER_LIVE_SUBMIT_ENABLED` | `false` |
| `CASPER_AGENT_LOOP_ENABLED` | `true` |
| `CASPER_AGENT_LOOP_DRY_RUN` | `true` |
| `CASPER_AGENT_LOOP_INTERVAL_SEC` | `60` |
| `CASPER_AGENT_LOOP_AUTO_READBACK` | `false` |
| `CASPER_DECISION_LEDGER_PATH` | `/data/casper-decision-log.sqlite3` if a volume is mounted, otherwise omit |

### Guarded live-submit mode

Use this mode only for the live proof window:

| Variable | Value |
|----------|-------|
| `CASPER_ACCOUNT_PUBLIC_KEY` | Funded Casper Testnet account public key |
| `CASPER_SECRET_KEY_PATH` | Path to a signer file outside git, for example `/data/casper/secret_key.pem` |
| `CASPER_LIVE_SUBMIT_ENABLED` | `true` |
| `CASPER_AGENT_LOOP_ENABLED` | `true` |
| `CASPER_AGENT_LOOP_DRY_RUN` | `false` |
| `CASPER_AGENT_LOOP_AUTO_READBACK` | `true` |
| `CASPER_AGENT_LOOP_POLL_MAX_RETRIES` | `10` |
| `CASPER_AGENT_LOOP_POLL_INTERVAL_SEC` | `5` |
| `CASPER_DECISION_LEDGER_PATH` | `/data/casper-decision-log.sqlite3` |

Mount a Railway volume on the backend at `/data` for live mode. The current code expects `CASPER_SECRET_KEY_PATH` to be a filesystem path, not the PEM contents. Keep the signer out of git and use a restricted, funded Testnet account.

### Optional backend variables

| Variable | Use |
|----------|-----|
| `CASPER_CSPR_CLOUD_API_KEY` | Optional account balance and fallback block-height probe |
| `CASPER_CSPR_CLOUD_URL` | Defaults to `https://api.testnet.cspr.cloud` |
| `CASPER_MIN_BALANCE_CSPR` | Low-balance warning threshold, default `50` |
| `CASPER_X402_EVIDENCE_URL` | Real x402 evidence endpoint, if available |
| `CASPER_X402_RECEIPT` | Real x402 receipt metadata; leave empty rather than faking a receipt |
| `CASPER_LLM_TRACE_ENABLED` | Enable LLM trace metadata when real trace capture is configured |
| `CASPER_LLM_TRACE_PROVIDER` | Trace provider label |
| `CASPER_LLM_TRACE_MODEL` | Trace model label |
| `CASPER_LLM_TRACE_CAPTURE` | Trace capture payload or reference |

## Frontend Variables

Set these on the `frontend` service.

| Variable | Value |
|----------|-------|
| `BACKEND_URL` or `BACKEND_INTERNAL_URL` | `http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8000` |
| `VITE_DEFAULT_NETWORK` | `casper-test` |
| `VITE_CASPER_EXPLORER_URL` | `https://testnet.cspr.live` |
| `FRONTEND_MAX_BODY_BYTES` | `1048576` unless larger API bodies are needed |

`VITE_API_URL` is only used by local Vite dev proxy configuration. Production browser calls stay same-origin at `/api/*`, and the Node server forwards them to `BACKEND_URL`.

## Deploy Steps

1. Push the target commit to the branch connected to Railway.
2. In Railway, create or update the `backend` service with root directory `backend`.
3. Add backend variables, then deploy the backend.
4. Attach a `/data` volume to the backend if using live mode or persistent dashboard history.
5. In Railway, create or update the `frontend` service with root directory `frontend`.
6. Add frontend variables, then deploy the frontend.
7. Generate public domains for the frontend and, if needed, the backend.
8. After changing variables, review and deploy Railway's staged changes.

For monorepo services, make sure the Railway config file path points at the service config if the dashboard asks for it:

| Service | Config file path |
|---------|------------------|
| `backend` | `/backend/railway.json` |
| `frontend` | `/frontend/railway.json` |

## Smoke Tests

After both services deploy, check these URLs:

| Check | URL |
|-------|-----|
| Frontend page | `https://<frontend-domain>/` |
| Frontend-to-backend proxy | `https://<frontend-domain>/api/health` |
| Session bootstrap | `https://<frontend-domain>/api/session` |
| Dashboard snapshot | `https://<frontend-domain>/api/dashboard/snapshot?limit=10` |
| Public proof through frontend proxy | `https://<frontend-domain>/api/public/proof` |
| Backend health, if public | `https://<backend-domain>/api/health` |
| Backend agent card, if public | `https://<backend-domain>/.well-known/casper-agent-card.json` |
| Backend public proof, if public | `https://<backend-domain>/api/public/proof` |

Expected backend health shape:

```json
{
  "status": "ok",
  "service": "omniagent-fastapi",
  "network": "casper",
  "adapter": "fastapi-casper-agent"
}
```

Expected log markers:

| Service | Log marker |
|---------|------------|
| `backend` | `casper_lifespan_loop_started` when `CASPER_AGENT_LOOP_ENABLED=true` |
| `frontend` | `frontend server listening on <PORT>` |

## Receipt Verification

Verify a Railway-hosted receipt from your workstation:

```bash
scripts/verify-casper-receipt.sh <decision_id> \
  --api-url https://<backend-domain> \
  --contract-hash <CASPER_DECISION_CONTRACT_HASH> \
  --use-rpc
```

Use the public backend domain for `--api-url` when available. The verifier initializes an API session, fetches dashboard receipts, and reads Casper state without needing backend secrets.

## Common Failure Modes

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Frontend returns `frontend_proxy_error` | `BACKEND_URL` or `BACKEND_INTERNAL_URL` missing or wrong | Set it to the backend private URL and redeploy frontend |
| Backend healthcheck fails | Wrong service root or Dockerfile not used | Set root directory to `backend` and config file path to `/backend/railway.json` |
| Frontend healthcheck fails | Wrong service root or missing `BACKEND_URL` during startup | Set root directory to `frontend` and add backend proxy env |
| `Host is not trusted` | Domain missing from `API_TRUSTED_HOSTS` | Add the Railway/custom backend host |
| Dashboard operator action returns `403` | `API_OPERATOR_TOKEN` is set but the session was not created with `X-Operator-Token` | Leave `API_OPERATOR_TOKEN` empty for the demo dashboard, or use an operator client that sends the header |
| Readiness says `casper_live_submit_disabled` | Safe mode is still enabled | Set `CASPER_LIVE_SUBMIT_ENABLED=true` only for live proof |
| Readiness says `casper_secret_key_path_missing` | No signer path configured | Mount `/data`, place signer file there, set `CASPER_SECRET_KEY_PATH` |
| Receipts disappear after redeploy | No persistent backend volume | Mount a backend volume and set `CASPER_DECISION_LEDGER_PATH=/data/casper-decision-log.sqlite3` |

## Railway References

- [Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles)
- [Railway config as code](https://docs.railway.com/config-as-code/reference)
- [Railway monorepo deployment](https://docs.railway.com/deployments/monorepo)
- [Railway variables](https://docs.railway.com/variables)
- [Railway private networking](https://docs.railway.com/networking/private-networking)
- [Railway volumes](https://docs.railway.com/volumes/reference)

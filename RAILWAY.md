# Railway Deployment

Deploy OmniAgent as three Railway services from the same repository.

## Services

| Service | Root Directory | Config File Path | Public Domain |
| --- | --- | --- | --- |
| `backend` | `/backend` | `/backend/railway.json` | Yes |
| `frontend` | `/frontend` | `/frontend/railway.json` | Yes |
| `twak-bridge` | `/twak-bridge` | `/twak-bridge/railway.json` | No |

Railway config files are service-scoped. In each Railway service, set the config file path explicitly in service settings.
Each service uses Dockerfile builds; keep the service Root Directory aligned with the table so `dockerfilePath: "Dockerfile"` resolves correctly.
The Config File Path is repository-root relative, so use `/backend/railway.json`, `/frontend/railway.json`, or `/twak-bridge/railway.json`.
The `dockerfilePath` inside each config is service-root relative after Railway applies Root Directory, so it should stay `Dockerfile`.
Do not leave a service Root Directory at `/` with these configs; that would make `COPY package.json ...` and `COPY pyproject.toml ...` look in the wrong directory for the backend/frontend/bridge build contexts.

## Backend Variables

Set these on the backend service:

```bash
TRADE_LEDGER_PATH=/data/trade-ledger.jsonl
TRUST_WALLET_AGENT_KIT_MODE=rest
TRUST_WALLET_AGENT_KIT_CONFIG={"baseUrl":"http://${{twak-bridge.RAILWAY_PRIVATE_DOMAIN}}:${{twak-bridge.PORT}}"}
TWAK_AGENT_WALLET=0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25
ROBOT_FLEET_AGENT_WALLET=0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25
BNB_TRADING_ENABLED=false
ALLOW_AGENT_RUN=false
BNB_AUTONOMOUS_LOOP_ENABLED=true
BNB_AUTONOMOUS_LOOP_EXECUTE=false
BNB_AUTONOMOUS_LOOP_INTERVAL_SEC=300
BNB_AUTONOMOUS_LOOP_INITIAL_DELAY_SEC=5
BNB_AUTONOMOUS_LOOP_SYMBOL=CAKE
BNB_AUTONOMOUS_LOOP_SIDE=buy
BNB_AUTONOMOUS_LOOP_AMOUNT_USD=25
BNB_AUTONOMOUS_LOOP_SLIPPAGE_BPS=50
BNB_STRATEGY_ADVISOR_ENABLED=true
BNB_STRATEGY_REQUIRE_LLM_FOR_LIVE=false
BNB_STRATEGY_MIN_CONFIDENCE=0.62
BNB_STRATEGY_MAX_POSITION_PCT=0.35
OPENROUTER_API_KEY=<backend-only-openrouter-key>
OPENROUTER_MODEL=deepseek/deepseek-v4-pro
```

`BNB_AUTONOMOUS_LOOP_ENABLED=true` starts the backend loop automatically on service startup.
Keep `BNB_AUTONOMOUS_LOOP_EXECUTE=false` for proof/smoke mode. Set it to `true` only when `BNB_TRADING_ENABLED=true`, `ALLOW_AGENT_RUN=true`, CMC signal proof, TWAK bridge, capital, registration, and emergency-pause recovery are all verified.
`OPENROUTER_API_KEY` must be set only on the backend service. The browser should never receive OpenRouter or CMC keys.
`deepseek/deepseek-v4-pro` is the current recommended cheap/reasoning model; use `deepseek/deepseek-v4-flash` only when cost is more important than strategy quality.

Also set the private CMC, TWAK, SDK, and x402 secrets from `backend/.env.example`.

Recommended: attach a Railway volume mounted at `/data` so `TRADE_LEDGER_PATH` survives redeploys.
Without the volume, the backend can still deploy and write the ledger inside the container filesystem, but that file is ephemeral and can be lost on redeploy.

## TWAK Bridge Variables

Set a fixed `PORT` service variable so other services can reference it:

```bash
PORT=8787
TWAK_ACCESS_ID=<sealed secret>
TWAK_HMAC_SECRET=<sealed secret>
WALLET_PASSWORD=<sealed secret, if the TWAK wallet requires one>
```

The bridge startup also accepts `TW_ACCESS_ID` / `TW_HMAC_SECRET` and maps them to TWAK's expected env names, but prefer `TWAK_*` on the bridge service. The backend service still uses `TW_ACCESS_ID` / `TW_HMAC_SECRET`; set the backend `TW_HMAC_SECRET` to the same value as bridge `TWAK_HMAC_SECRET`.

Do not expose a public Railway domain for this service. The backend should reach it only over Railway private networking.

## Frontend Variables

Set this on the frontend service:

```bash
BACKEND_INTERNAL_URL=http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:${{backend.PORT}}
```

The frontend serves browser traffic and proxies `/api/*` to `BACKEND_INTERNAL_URL` server-side.
Do not set a public backend URL in `VITE_API_URL` for production; browser assets should not contain the backend origin.
In Railway, remove the backend public domain after the frontend proxy health checks pass so users cannot bypass the frontend origin.

## Post-Deploy Checks

```bash
curl https://<frontend-public-domain>.up.railway.app/api/health
```

Then call these MCP tools through the deployed frontend origin:

- `bnb_get_wallet`
- `bnb_trust_wallet_status`
- `bnb_live_preflight`
- `bnb_live_proof_bundle`

Keep `BNB_TRADING_ENABLED=false` and `ALLOW_AGENT_RUN=false` until the deployed TWAK bridge, CMC signal, registration proof, capital, and emergency-pause recovery are all verified.

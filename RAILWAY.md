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
BNB_BUNDLED_REGISTRATION_PROOF_ENABLED=true
BNB_STRATEGY_ADVISOR_ENABLED=true
BNB_STRATEGY_REQUIRE_LLM_FOR_LIVE=false
BNB_STRATEGY_MIN_CONFIDENCE=0.62
BNB_STRATEGY_MAX_POSITION_PCT=0.35
OPENROUTER_API_KEY=<backend-only-openrouter-key>
OPENROUTER_MODEL=deepseek/deepseek-v4-pro
API_TRUSTED_HOSTS=localhost,127.0.0.1,testserver,healthcheck.railway.app,*.up.railway.app,*.railway.internal
ALLOWED_FRONTEND_ORIGINS=https://<frontend-public-domain>.up.railway.app
```

`BNB_AUTONOMOUS_LOOP_ENABLED=true` starts the backend loop automatically on service startup.
Keep `BNB_AUTONOMOUS_LOOP_EXECUTE=false` for proof/smoke mode. Set it to `true` only when `BNB_TRADING_ENABLED=true`, `ALLOW_AGENT_RUN=true`, CMC signal proof, TWAK bridge, capital, registration, and emergency-pause recovery are all verified.
`BNB_BUNDLED_REGISTRATION_PROOF_ENABLED=true` is an explicit fallback for the packaged public registration receipt when the production ledger volume is empty and BSC RPC log lookup is rate-limited. Leave it false if the deployment must rely only on live RPC/TWAK registration status.
`OPENROUTER_API_KEY` must be set only on the backend service. The browser should never receive OpenRouter or CMC keys.
`deepseek/deepseek-v4-pro` is the current recommended cheap/reasoning model; use `deepseek/deepseek-v4-flash` only when cost is more important than strategy quality.

Also set the private CMC, TWAK, SDK, and x402 secrets from `backend/.env.example`.

Recommended: attach a Railway volume mounted at `/data` so `TRADE_LEDGER_PATH` survives redeploys.
Without the volume, the backend can still deploy and write the ledger inside the container filesystem, but that file is ephemeral and can be lost on redeploy.

### Dashboard Data Parity

Local dashboard history is read from the ignored runtime ledger at `backend/data/trade-ledger.jsonl`.
Railway does not receive that file from git, so the deployed dashboard will only show records written to the configured `TRADE_LEDGER_PATH`.

Use these checks when the Railway frontend looks sparse:

```bash
curl -c /tmp/omniagent.cookies https://<frontend-public-domain>.up.railway.app/api/session
curl -b /tmp/omniagent.cookies https://<frontend-public-domain>.up.railway.app/api/dashboard/trades?limit=5
curl -b /tmp/omniagent.cookies https://<frontend-public-domain>.up.railway.app/api/dashboard/snapshot?limit=5
```

`recordType: "trade"` rows are submitted or confirmed on-chain trades. `recordType: "cycle"` rows are guarded autonomous cycles with no tx hash yet; these are still useful dashboard evidence, but they are not execution proof.
If local has historical `trade_executed` rows and Railway does not, attach the `/data` volume and import or preserve the production ledger there before comparing frontend parity.

## TWAK Bridge Variables

Set a fixed `PORT` service variable so other services can reference it:

```bash
PORT=8787
TWAK_ACCESS_ID=<sealed secret>
TWAK_HMAC_SECRET=<sealed secret>
WALLET_PASSWORD=<sealed secret, if the TWAK wallet requires one>
TWAK_WALLET_JSON_B64=<base64 of encrypted ~/.twak/wallet.json, if the bridge has no persistent wallet volume>
```

The bridge startup also accepts `TW_ACCESS_ID` / `TW_HMAC_SECRET` and maps them to TWAK's expected env names, but prefer `TWAK_*` on the bridge service. The backend service still uses `TW_ACCESS_ID` / `TW_HMAC_SECRET`; set the backend `TW_HMAC_SECRET` to the same value as bridge `TWAK_HMAC_SECRET`.
The bridge `start.sh` maps Railway `WALLET_PASSWORD` to TWAK's `TWAK_WALLET_PASSWORD` at runtime so the secret is not passed as a command-line argument. If `TWAK_WALLET_JSON_B64` is set, `start.sh` decodes it into TWAK's encrypted `~/.twak/wallet.json` before starting the REST bridge.
If `bnb_trust_wallet_status` reports `state: "unbound"`, the bridge is reachable but no local TWAK wallet is bound. Create or restore the TWAK wallet in the bridge service storage, set `WALLET_PASSWORD`, and confirm `twak wallet status --json` reports the same address configured in `TWAK_AGENT_WALLET` / `ROBOT_FLEET_AGENT_WALLET`.

Do not expose a public Railway domain for this service. The backend should reach it only over Railway private networking.

## Frontend Variables

Set this on the frontend service:

```bash
BACKEND_INTERNAL_URL=http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:${{backend.PORT}}
```

The frontend serves browser traffic and proxies `/api/*` to `BACKEND_INTERNAL_URL` server-side.
Do not set a public backend URL in `VITE_API_URL` for production; browser assets should not contain the backend origin.
In Railway, remove the backend public domain after the frontend proxy health checks pass so users cannot bypass the frontend origin.
If `/api/session` returns `{"detail":"Host is not trusted"}`, confirm the backend service has `API_TRUSTED_HOSTS` set to include the frontend public domain and the backend private Railway domain, or use the checked-in Railway suffix patterns above.

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

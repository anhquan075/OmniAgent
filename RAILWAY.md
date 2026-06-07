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
```

Also set the private CMC, TWAK, SDK, and x402 secrets from `backend/.env.example`.

Attach a Railway volume mounted at `/data` so `TRADE_LEDGER_PATH` survives redeploys.

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
VITE_API_URL=https://<backend-public-domain>.up.railway.app
```

`VITE_API_URL` is baked into the Vite build, so redeploy the frontend after changing it.

## Post-Deploy Checks

```bash
curl https://<backend-public-domain>.up.railway.app/api/health
```

Then call these MCP tools from the deployed backend:

- `bnb_get_wallet`
- `bnb_trust_wallet_status`
- `bnb_live_preflight`
- `bnb_live_proof_bundle`

Keep `BNB_TRADING_ENABLED=false` and `ALLOW_AGENT_RUN=false` until the deployed TWAK bridge, CMC signal, registration proof, capital, and emergency-pause recovery are all verified.

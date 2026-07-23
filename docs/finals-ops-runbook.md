# Finals ops runbook

Status as of **2026-07-23**. Native Casper x402 + collateral vault are on
`main` and live on Railway. Use this doc for remaining judge-facing paste work;
keep explorer hashes aligned with the proof table in [`README.md`](../README.md)
and [`dorahacks-finals-description.md`](dorahacks-finals-description.md).

Public surfaces:

| Surface | URL |
|---------|-----|
| Frontend | https://omniyield.app |
| Public proof | https://omniagent-production.up.railway.app/api/public/proof |
| x402 setup | https://omniagent-production.up.railway.app/api/x402/setup |
| Paywalled evidence | https://omniagent-production.up.railway.app/api/x402/rwa-evidence |

## Done on production

| Item | Status |
|------|--------|
| Native Casper facilitator | `facilitatorUrl=https://x402-facilitator.cspr.cloud`, `paymentNetwork=casper:casper-test` |
| Paywall challenge | unpaid `GET /api/x402/rwa-evidence` → HTTP **402** with Casper `accepts[]` |
| Facilitator arm | `settleReady=true`, `hardBlockers=[]` (needs CSPR.cloud API key — set) |
| Stale Base/USDC `CASPER_X402_RECEIPT` | deleted |
| Vault install | [21437ac6…](https://testnet.cspr.live/deploy/21437ac6d7da2965e632d2f931678f6484707474b5b10204be55184076e45946) |
| Vault contract | [`66969eea…bb55f`](https://testnet.cspr.live/contract/66969eead67ac3cb07e131dc86bf4e6b7e63d2c2a33fb1779f705d79878bb55f) |
| Vault package | [`5868d6d6…abed3`](https://testnet.cspr.live/contract-package/5868d6d6bc65f0e6e1aba462eaf6bf2850075313ae576e49f640864f4e1abed3) |
| Vault canary | deposit / [freeze](https://testnet.cspr.live/deploy/8d7912626337e21cbb483554bca310f0e00c198c82a990b6bbe7cd6cad6a7591) / [unfreeze](https://testnet.cspr.live/deploy/7b24ab0e262f62960edbb6c24aaa1dfef8fdc9aba4eb4237671b2ce5b734c078) |
| Vault Railway env | `CASPER_VAULT_CONTRACT_HASH` + `CASPER_VAULT_PACKAGE_HASH` set; `CASPER_VAULT_ENFORCE_ENABLED=true`; `CASPER_VAULT_ASSET_ID=rwa-demo-collateral-001` |
| Public proof `vault` | `configured=true`, `enforceEnabled=true` |

Re-check anytime:

```bash
curl -sS https://omniagent-production.up.railway.app/api/x402/setup | jq '{facilitatorUrl,paymentNetwork,settleReady,hardBlockers}'
curl -sS -o /dev/null -w '%{http_code}\n' https://omniagent-production.up.railway.app/api/x402/rwa-evidence
# expect 402
curl -sS https://omniagent-production.up.railway.app/api/public/proof | jq '{x402, vault}'
```

## Remaining before judging

### 1. Live Casper x402 settle + receipt refresh

Paywall is settle-ready; public proof still reports `x402.status=unavailable`
with `x402_receipt_missing` until a real CEP-18 settle lands and
`CASPER_X402_RECEIPT` is refreshed with public-safe Casper fields
(`receiptId` / `receiptHash`, `provider`, `resourceUrl`, `paidAt`, `amount`,
`currency`, optional `sourceHash` / `requestHash`).

Probe only (no settle):

```bash
cd backend
uv run python scripts/settle_x402_casper_once.py --url https://omniagent-production.up.railway.app
```

After settle:

1. Paste the CEP-18 transfer tx into DoraHacks proof table **row 6**.
2. Set Railway `CASPER_X402_RECEIPT` (do not fake Base/USDC metadata).
3. Confirm public proof: `x402.status=verified`, `bindingStatus=bound`,
   `hardBlockers=[]`.

> README “Current Public Deployment” still shows an older verified x402 receipt
> snapshot (`Last verified: 2026-07-11`). Prefer a fresh
> `/api/public/proof` response after the Casper settle.

### 2. Fresh vault-enforced loop cycle (optional but useful)

Vault enforcement is armed. A sticky decision id can be blocked by
`casper_chain_duplicate_intent`, so the latest cycle may not show a new
deploy/readback/vault mutation until evidence changes enough to mint a new
`decisionId`. After a new verified readback, public proof `vault.latestAction`
should reflect freeze / unfreeze / set_ltv.

### 3. DoraHacks BUIDL paste

Paste [`dorahacks-finals-description.md`](dorahacks-finals-description.md) into
https://dorahacks.io/buidl/40823.

- Rows **7–10** (vault) are filled with live explorer links matching README.
- Row **6** (x402 CEP-18 settle) still pending until step 1.
- Fill socials on the BUIDL page before judging.
- Update the “Honest status” blurb once settle + paste are done (it still
  mentions the feature branch as if cutover had not landed).

### 4. Ops hygiene

- Rotate the CSPR.cloud API key if it was pasted into chat or logs.
- Keep `CASPER_X402_FACILITATOR_API_KEY` / `CASPER_CSPR_CLOUD_API_KEY` in Railway
  secrets only (CSPR.cloud token — not CSPR.click).

## Reinstall / re-canary (only if needed)

Vault is already installed. Re-run only after a new Wasm or a wiped Testnet
account:

```bash
export CASPER_SECRET_KEY_PATH=/path/to/secret_key.pem
export AGENT_ACCOUNT_HASH=account-hash-...
./scripts/install-collateral-vault.sh
# copy contract + package hashes → Railway, then:
cd backend
uv run python scripts/vault_demo_cycle.py
# keep CASPER_VAULT_ENFORCE_ENABLED=false until canary succeeds
```

## Env reference (production shape)

Canonical variable docs: [`railway-deployment.md`](railway-deployment.md).
Vault arming (from README):

```bash
CASPER_VAULT_CONTRACT_HASH=66969eead67ac3cb07e131dc86bf4e6b7e63d2c2a33fb1779f705d79878bb55f
CASPER_VAULT_PACKAGE_HASH=5868d6d6bc65f0e6e1aba462eaf6bf2850075313ae576e49f640864f4e1abed3
CASPER_VAULT_ENFORCE_ENABLED=true
CASPER_VAULT_ASSET_ID=rwa-demo-collateral-001
```

x402 defaults in production:

| Variable | Expected |
|----------|----------|
| `CASPER_X402_FACILITATOR_URL` | `https://x402-facilitator.cspr.cloud` |
| `CASPER_X402_NETWORK` | `casper:casper-test` |
| `CASPER_X402_CURRENCY` | `WCSPR` |
| `CASPER_X402_AMOUNT` / `CASPER_X402_PRICE` | `1000000` |
| `CASPER_X402_PAY_TO_ADDRESS` | `00` + agent account-hash |
| `CASPER_X402_FACILITATOR_API_KEY` | CSPR.cloud token (or shared `CASPER_CSPR_CLOUD_API_KEY`) |
| `CASPER_X402_RECEIPT` | empty until Casper settle; then public-safe Casper receipt JSON |

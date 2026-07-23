# Finals ops runbook

Status as of **2026-07-23**. Native Casper x402 + collateral vault are on
`main` / Railway. Prefer `https://omniyield.app` when the raw Railway host is
WAF-blocked.

## Production status

| Item | Status |
|------|--------|
| Native Casper facilitator | `facilitatorUrl=https://x402-facilitator.cspr.cloud`, `paymentNetwork=casper:casper-test` |
| Paywall challenge | unpaid evidence → HTTP **402** with Casper `accepts[]` |
| Facilitator arm | `settleReady=true` (CSPR.cloud API key set) |
| Stale Base/USDC receipt | deleted |
| Latest decision canary | `warn` deploy `9e696671…` (2026-07-23) — public proof `live_verified` |
| Vault install / freeze / unfreeze | live on casper-test; fresh freeze `6d593895…` + unfreeze `3ec2aad5…` (2026-07-23) |
| Vault Railway env | hashes set; `CASPER_VAULT_ENFORCE_ENABLED=true` |
| x402 asset | bare WCSPR `3d80df21…`; receipt bound (`bindingStatus=bound`) |

```bash
curl -sS https://omniyield.app/api/x402/setup | jq '{facilitatorUrl,paymentNetwork,settleReady,asset,hardBlockers}'
curl -sS -o /dev/null -w '%{http_code}\n' https://omniyield.app/api/x402/rwa-evidence
# expect 402 and asset WITHOUT hash- prefix
```

## Critical: CEP-18 asset format

Facilitator rejects `hash-…` package ids (`invalid_exact_casper_invalid_asset`).

Set Railway (and defaults) to **bare 64-hex**:

```bash
CASPER_X402_ASSET=3d80df21ba4ee4d66a2a1f60c32570dd5685e4b279f6538162a5fd1314847c1e
CASPER_X402_ASSET_NAME=Wrapped CSPR
```

Code also strips `hash-` / `0x` via `normalize_cep18_asset` so either form is
accepted after deploy. Prefer wrapable **Wrapped CSPR** (`3d80df21…`) for
finals — it has `deposit` so a funded buyer can mint WCSPR 1:1 from CSPR.
CasCet (`cb65a928…`) has `transfer_with_authorization` but **no mint/deposit**.

## Live x402 settle (proof table row 6)

1. Fund a buyer with Testnet CSPR (faucet / transfer).
2. Wrap ≥ `0.001` CSPR into WCSPR via cargo-proxy `deposit` (see
   `backend/scripts/wrap_wcspr_once.mjs`).
3. Settle:

```bash
cd backend
npm install @make-software/casper-x402 casper-js-sdk
export CLIENT_PRIVATE_KEY_PATH=/path/to/buyer_secret_key.pem
export CLIENT_KEY_ALGO=ed25519
node scripts/settle_x402_casper_live.mjs
# or DIRECT_FACILITATOR=1 CASPER_X402_FACILITATOR_API_KEY=... node ...
```

4. Paste successful deploy into DoraHacks row 6.
5. Set Railway `CASPER_X402_RECEIPT` with public-safe Casper fields.
6. Confirm `/api/public/proof` → `x402.status=verified`, `bindingStatus=bound`.

### Attempt log (2026-07-23)

- OmniAgent paywall ready; unpaid → 402.
- `hash-cb65a928…` → facilitator `invalid_exact_casper_invalid_asset` (fixed in code).
- Direct settle with unfunded buyer `01e6bcbf…` → deploy
  `9fe35eed…` **failed** (`User error: 64658`, zero balance). Do not paste.
- Funded buyer with 20 CSPR → wrap
  [`714f8539…`](https://testnet.cspr.live/transaction/714f85394e405977939a1d58391eaede2a604275a0c3bd9e2783b2ac585d3bcd)
  → **successful** CEP-18 settle to OmniAgent `payTo`
  [`93074ccb…`](https://testnet.cspr.live/deploy/93074ccb7f55f7a6eac5f4acdf5de21943c43384a1bfb0f1e194c736eed3bae5)
  (Wrapped CSPR `3d80df21…`, amount `1000000`).

**Still set on Railway:**

```bash
CASPER_X402_ASSET=3d80df21ba4ee4d66a2a1f60c32570dd5685e4b279f6538162a5fd1314847c1e
CASPER_X402_ASSET_NAME=Wrapped CSPR
CASPER_X402_RECEIPT='{"receiptId":"93074ccb7f55f7a6eac5f4acdf5de21943c43384a1bfb0f1e194c736eed3bae5","provider":"x402","resourceUrl":"https://omniagent-production.up.railway.app/api/x402/rwa-evidence","paidAt":"2026-07-23T00:00:00+00:00","amount":"1000000","currency":"WCSPR","network":"casper:casper-test","settlementTxHash":"93074ccb7f55f7a6eac5f4acdf5de21943c43384a1bfb0f1e194c736eed3bae5","seller":"005fbafb3d180056637745218c3a21bef20ad4aca0737b676125791db7a2ead0c6","buyer":"009201bf2e2468c8ae48c516dd0dadb4174a523bd1869b6d422795712a7b9d65cc"}'
```

## Manual finals canary (decision)

`/api/cycle/run` does **not** auto-fetch Treasury evidence (only the scheduled loop does).
For a fresh distinct deploy when the latest on-chain intent is still `approve`:

1. Fetch live Treasury Notes evidence.
2. `POST /api/cycle/run` with `submit=true`, `iUnderstandThisSubmitsCasperTestnet=true`,
   `evidence=[...]`, and a distinct allowed action (e.g. `warn`).
3. `POST /api/readback/record` with the new `decisionId` + `deployHash`.
4. Confirm `/api/public/proof` shows the new deploy.

2026-07-23 canary: decision
`9e6966710a9d2a18ec091e44bd5d90e20fa12ca4d37e123a9be7536b3545e735`
(`warn` / `rwa-collateral-364c8fcae028211779d7`).

## Manual finals canary (vault)

```bash
railway ssh --service OmniAgent-BE -- \
  'cd /app && .venv/bin/python scripts/vault_demo_cycle.py --skip-deposit'
```

2026-07-23 canary: freeze
`6d593895ac07be367d417f89d23f639b814abe850bbcff1286b04a29c34f379c`,
unfreeze
`3ec2aad5212688b63070a41fa4b3f601173186e08db877f68772cf403c5cdd23`.

## DoraHacks paste

Paste [`dorahacks-finals-description.md`](dorahacks-finals-description.md) into
https://dorahacks.io/buidl/40823. Rows **6–10** have live explorer links.
Fill socials before judging.

## Env reference

| Variable | Expected |
|----------|----------|
| `CASPER_X402_FACILITATOR_URL` | `https://x402-facilitator.cspr.cloud` |
| `CASPER_X402_NETWORK` | `casper:casper-test` |
| `CASPER_X402_CURRENCY` | `WCSPR` |
| `CASPER_X402_AMOUNT` | `1000000` |
| `CASPER_X402_ASSET` | bare `3d80df21…` (Wrapped CSPR) |
| `CASPER_X402_ASSET_NAME` | `Wrapped CSPR` |
| `CASPER_X402_PAY_TO_ADDRESS` | `00` + seller account-hash |
| `CASPER_X402_FACILITATOR_API_KEY` | CSPR.cloud token |
| `CASPER_X402_RECEIPT` | empty until settle; then public-safe JSON |
| `CASPER_VAULT_*` | see README / railway-deployment.md |

# Finals ops runbook — remaining live steps

Code on `finals/native-casper-x402-vault` implements Phases 1–3. Production
(`omniagent-production.up.railway.app`) still reports the **old** EVM facilitator
(`x402.org` / `eip155:84532`) until this branch is deployed and env is updated.

## 1. Deploy this branch to Railway

Set/replace backend variables (skip deploys while editing if needed):

| Variable | Value | Railway status (2026-07-23) |
|----------|-------|------------------------------|
| `CASPER_X402_FACILITATOR_URL` | `https://x402-facilitator.cspr.cloud` | set (`--skip-deploys`) |
| `CASPER_X402_NETWORK` | `casper:casper-test` | set |
| `CASPER_X402_CURRENCY` | `WCSPR` | set |
| `CASPER_X402_AMOUNT` / `CASPER_X402_PRICE` | `1000000` | set |
| `CASPER_X402_ASSET` | make-software WCSPR package hash | set |
| `CASPER_X402_PAY_TO_ADDRESS` | `00` + account-hash of agent pubkey | set (derived) |
| `CASPER_X402_FACILITATOR_API_KEY` | CSPR.cloud facilitator key | **still missing** |
| `CASPER_X402_RECEIPT` | clear old Base/USDC receipt | **still stale EVM receipt** — delete on cutover |
| `CASPER_VAULT_CONTRACT_HASH` | set after vault install | missing |
| `CASPER_VAULT_PACKAGE_HASH` | set after vault install | missing |
| `CASPER_VAULT_ENFORCE_ENABLED` | `false` until canary | set `false` |
| `CASPER_VAULT_ASSET_ID` | `rwa-demo-collateral-001` | set |

Vars were written with `--skip-deploys`, so the **running** `main` container still has the old process env until the next OmniAgent-BE deploy. Deploy `finals/native-casper-x402-vault` (or merge to `main`) to pick them up.

Verify after deploy:

```bash
curl -sS https://omniagent-production.up.railway.app/api/x402/setup | jq .
# expect facilitatorUrl=x402-facilitator.cspr.cloud, paymentNetwork=casper:casper-test
curl -sS -D- https://omniagent-production.up.railway.app/api/x402/rwa-evidence -o /tmp/body.json
# expect HTTP 402 + Casper accepts[]
```

## 2. Install collateral vault

```bash
export CASPER_SECRET_KEY_PATH=/path/to/secret_key.pem
export AGENT_ACCOUNT_HASH=account-hash-...   # agent account
./scripts/install-collateral-vault.sh
```

Copy hashes from cspr.live → Railway. Then:

```bash
cd backend
uv run python scripts/vault_demo_cycle.py
# paste freeze + unfreeze deploy URLs into docs/dorahacks-finals-description.md
```

Arm: `CASPER_VAULT_ENFORCE_ENABLED=true`.

## 3. Live x402 settle

Needs a buyer key + facilitator API key. Probe only (no settle) with:

```bash
cd backend
uv run python scripts/settle_x402_casper_once.py --url https://omniagent-production.up.railway.app
```

After a real settle, paste the CEP-18 transfer tx into the DoraHacks proof table
(row 6) and refresh `CASPER_X402_RECEIPT` with public-safe Casper fields.

## 4. DoraHacks paste

Paste [`docs/dorahacks-finals-description.md`](dorahacks-finals-description.md)
into https://dorahacks.io/buidl/40823. Fill proof rows 6–10 and socials before
judging.

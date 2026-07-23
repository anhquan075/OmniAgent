# OmniAgent Collateral Vault

Native Casper Rust contract that **enforces** AI risk decisions on-chain.

## Entry points

| Entry point | Requires approved receipt action | Effect |
|-------------|----------------------------------|--------|
| `deposit(asset_id, amount)` | — | Credit demo collateral balance |
| `freeze(asset_id, decision_id, receipt)` | `block` | Freeze position |
| `unfreeze(asset_id, decision_id, receipt)` | `approve` | Unfreeze position |
| `set_ltv(asset_id, decision_id, receipt, ltv_bps)` | `haircut` | Set LTV in basis points |
| `get_position` / `is_frozen` / `get_ltv` | — | Reads |

Receipt format must match `casper-decision-proof`:

```text
decision_id|action|risk_score|proof_digest|rationale|source|timestamp|policy_gate|agent|guardrail
```

`policy_gate` must be `approved`. User error codes: `100` bad receipt, `101` id mismatch, `102` gate not approved, `103` action mismatch, `110` deposit while frozen, `111` freeze with zero deposit.

## Install args

- `proof_contract_hash` (string) — decision-proof contract hash (stored for audit)
- `agent_account_hash` (string) — agent account hash (stored for audit)

## Build

```bash
cd contracts/collateral-vault
cargo build --release --target wasm32v1-none
# artifact: target/.../collateral-vault.wasm (or wasm/collateral-vault.wasm in repo)
```

## Arm in backend

```bash
CASPER_VAULT_CONTRACT_HASH=<hash>
CASPER_VAULT_ENFORCE_ENABLED=true
CASPER_VAULT_ASSET_ID=rwa-demo-collateral-001
```

Install on Testnet: [`scripts/install-collateral-vault.sh`](../../scripts/install-collateral-vault.sh).
Canary cycle: `cd backend && uv run python scripts/vault_demo_cycle.py`.

The autonomous loop maps `block→freeze`, `approve→unfreeze`, `haircut→set_ltv` after a verified decision readback.

## Deploy checklist (ops)

1. Ensure `casper-client` is on PATH and `CASPER_SECRET_KEY_PATH` points at a funded Testnet key.
2. Set `AGENT_ACCOUNT_HASH` to the agent account-hash, then run `scripts/install-collateral-vault.sh`.
3. Copy contract/package hashes from the install deploy on cspr.live into Railway.
4. Keep `CASPER_VAULT_ENFORCE_ENABLED=false` until `vault_demo_cycle.py` deposit+freeze+unfreeze succeeds.
5. Arm enforce; confirm `/api/public/proof` → `vault.lastAction` / `vault.explorerUrl`.

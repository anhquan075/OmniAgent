# OmniAgent collateral vault

Native Casper Rust contract that **enforces** AI risk decisions on-chain — freeze, unfreeze, or change LTV only when the decision-proof receipt says so.

## Entry points

| Entry point | Needs approved receipt action | Effect |
|-------------|-------------------------------|--------|
| `deposit(asset_id, amount)` | — | Credit demo collateral |
| `freeze(...)` | `block` | Freeze the position |
| `unfreeze(...)` | `approve` | Unfreeze |
| `set_ltv(..., ltv_bps)` | `haircut` | Set LTV in basis points |
| `enforce_verified(...)` | Live-read from decision-proof package | Run freeze / unfreeze / haircut only if the claim matches on-chain |
| `get_position` / `is_frozen` / `get_ltv` | — | Reads |

Receipt format matches the decision-proof contract:

```text
decision_id|action|risk_score|proof_digest|rationale|source|timestamp|policy_gate|agent|guardrail
```

`policy_gate` must be `approved`.

### User error codes

| Code | Meaning |
|------|---------|
| 100 | Bad receipt |
| 101 | Decision id mismatch |
| 102 | Gate not approved |
| 103 | Action mismatch |
| 104 | Caller receipt differs from decision-proof |
| 110 | Deposit while frozen |
| 111 | Freeze with zero deposit |
| 120 | Invalid proof package hash |

## Install args

- `proof_contract_hash` — decision-proof **package** hash (name kept for deploy compatibility; `enforce_verified` always uses the latest package version)
- `agent_account_hash` — agent account hash (stored for audit)

## Build

```bash
./scripts/build-casper-contracts.sh   # both contracts → contracts/*/wasm/
```

Prefer this script over a bare `cargo build`. The raw release Wasm is **not installable** on `casper-test`: it is over the install-lane size limit and includes sign-extension opcodes the MVP Casper VM rejects. Installs then fail late with `ApiError::InvalidArgument [3]` after burning the full payment. The script runs `wasm-opt -Oz --mvp-features --signext-lowering` and fails if the result still exceeds the lane budget.

## Upgrade vs fresh install

Re-running the Wasm **upgrades the package in place** (`add_contract_version`) when the installer already holds `omniagent_vault_v3_access`. A second `new_contract` would clash with existing named keys and strand the live `positions_v3` dictionary on the old package.

What that means for the next deploy:

- `CASPER_VAULT_VERIFIED_PACKAGE_HASH` stays valid (package hash is stable)
- `CASPER_VAULT_VERIFIED_CONTRACT_HASH` **changes** — re-pin it in Railway, then refresh the enforce canary and `/api/public/proof` → `contractLinks.vaultContractHash`
- Rollback = another `add_contract_version` with the previous Wasm

The live Testnet v3 was built before this upgrade path landed, so the repo’s `wasm/collateral-vault.wasm` can be a couple of KB larger than the deployed bytes. The next deploy picks up the upgrade path; the current on-chain version is unchanged until then.

## Arm in the backend

```bash
CASPER_VAULT_CONTRACT_HASH=<hash>
CASPER_VAULT_ENFORCE_ENABLED=true
CASPER_VAULT_ASSET_ID=rwa-demo-collateral-001
CASPER_VAULT_VERIFIED_CONTRACT_HASH=<v3 hash>
CASPER_VAULT_VERIFIED_PACKAGE_HASH=<v3 package hash>
CASPER_VAULT_VERIFIED_ENABLED=true
```

Install: [`scripts/install-collateral-vault.sh`](../../scripts/install-collateral-vault.sh)  
Canary: `cd backend && uv run python scripts/vault_demo_cycle.py`

After a verified decision readback, the loop maps `block→freeze`, `approve→unfreeze`, `haircut→set_ltv` (or `enforce_verified` when verified mode is on).

## Cheat Lab (vault reverts)

Published canaries on `/try` (also under `cheatReverts` in public proof):

| Scenario | User | Entry |
|----------|------|-------|
| Malformed receipt | 100 | `freeze` |
| Unapproved policy gate | 102 | `freeze` |
| Wrong action | 103 | `freeze` |
| Tampered authoritative receipt | 104 | `enforce_verified` |

ACL authoring attacks (User 130 / 131) live on the decision-proof package — see [casper-decision-proof/README.md](../casper-decision-proof/README.md).

## Ops checklist

1. Put `casper-client` on PATH; point `CASPER_SECRET_KEY_PATH` at a funded Testnet key.
2. Set `AGENT_ACCOUNT_HASH` and `PROOF_CONTRACT_PACKAGE_HASH`, then run `scripts/install-collateral-vault.sh`.
3. Copy contract/package hashes from cspr.live into Railway (`CASPER_VAULT_*` and `CASPER_VAULT_VERIFIED_*`).
4. Keep `CASPER_VAULT_ENFORCE_ENABLED=false` until `vault_demo_cycle.py` deposit → freeze → unfreeze succeeds.
5. Arm verified enforce; confirm `/api/public/proof` shows `vault.verificationMode=cross_contract` and a vault explorer URL.

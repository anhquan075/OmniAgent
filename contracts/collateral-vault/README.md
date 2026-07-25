# OmniAgent Collateral Vault

Native Casper Rust contract that **enforces** AI risk decisions on-chain.

## Entry points

| Entry point | Requires approved receipt action | Effect |
|-------------|----------------------------------|--------|
| `deposit(asset_id, amount)` | — | Credit demo collateral balance |
| `freeze(asset_id, decision_id, receipt)` | `block` | Freeze position |
| `unfreeze(asset_id, decision_id, receipt)` | `approve` | Unfreeze position |
| `set_ltv(asset_id, decision_id, receipt, ltv_bps)` | `haircut` | Set LTV in basis points |
| `enforce_verified(asset_id, decision_id, receipt, ltv_bps)` | live-read from decision-proof package | Dispatch `block` / `approve` / `haircut` only when the claim exactly matches on-chain |
| `get_position` / `is_frozen` / `get_ltv` | — | Reads |

Receipt format must match `casper-decision-proof`:

```text
decision_id|action|risk_score|proof_digest|rationale|source|timestamp|policy_gate|agent|guardrail
```

`policy_gate` must be `approved`. User error codes: `100` bad receipt, `101` id mismatch, `102` gate not approved, `103` action mismatch, `104` caller receipt differs from decision-proof, `110` deposit while frozen, `111` freeze with zero deposit, `120` invalid proof package hash.

## Install args

- `proof_contract_hash` (string) — decision-proof **package** hash. The historical arg name is retained for deploy compatibility; `enforce_verified` calls the latest package version.
- `agent_account_hash` (string) — agent account hash (stored for audit)

## Build

```bash
./scripts/build-casper-contracts.sh   # both contracts -> contracts/*/wasm/
```

Use the script rather than a bare `cargo build`. The raw release artifact is
**not installable** on `casper-test`: it is over the install-lane size limit and
carries sign-extension opcodes the MVP-only Casper VM rejects, so the install
deploy fails late with `ApiError::InvalidArgument [3]` *after* consuming the
full payment. The script runs `wasm-opt -Oz --mvp-features --signext-lowering`
and hard-fails if the result exceeds the lane budget.

## Upgrade vs fresh install

Re-running the Wasm now **upgrades the package in place** (`add_contract_version`
with empty named keys) whenever the installer account already holds
`omniagent_vault_v3_access`. A second `new_contract` would revert on the
existing account named keys and would strand the live `positions_v3`
dictionary on the old package.

Consequences when you next deploy:

- `CASPER_VAULT_VERIFIED_PACKAGE_HASH` stays valid — the package hash is stable
  across versions, and `enforce_verified` resolves the decision-proof package's
  latest version.
- `CASPER_VAULT_VERIFIED_CONTRACT_HASH` **changes** per version and must be
  re-pinned in Railway, after which the enforce canary and
  `/api/public/proof` → `contractLinks.vaultContractHash` need refreshing.
- Rollback is another `add_contract_version` with the previous Wasm.

The v3 contract currently live on Testnet was built before this upgrade branch
existed, so `wasm/collateral-vault.wasm` in the repo (which tracks the source)
is intentionally a couple of KB larger than the deployed bytes. The deployed
version is unaffected; the next deploy picks up the upgrade path.

## Arm in backend

```bash
CASPER_VAULT_CONTRACT_HASH=<hash>
CASPER_VAULT_ENFORCE_ENABLED=true
CASPER_VAULT_ASSET_ID=rwa-demo-collateral-001
CASPER_VAULT_VERIFIED_CONTRACT_HASH=<v3 hash>
CASPER_VAULT_VERIFIED_PACKAGE_HASH=<v3 package hash>
CASPER_VAULT_VERIFIED_ENABLED=true
```

Install on Testnet: [`scripts/install-collateral-vault.sh`](../../scripts/install-collateral-vault.sh).
Canary cycle: `cd backend && uv run python scripts/vault_demo_cycle.py`.

The autonomous loop maps `block→freeze`, `approve→unfreeze`, `haircut→set_ltv`
(or `enforce_verified` when verified mode is armed) after a verified decision
readback.

## Cheat Lab (vault reverts)

Published explorer canaries on `/try` (also under `cheatReverts` in public proof):

| Scenario | User | Entry |
|----------|------|-------|
| Malformed receipt | 100 | `freeze` |
| Unapproved policy gate | 102 | `freeze` |
| Wrong action | 103 | `freeze` |
| Tampered authoritative receipt | 104 | `enforce_verified` |

ACL authoring attacks (User 130/131) live on the decision-proof package — see
[`../casper-decision-proof/README.md`](../casper-decision-proof/README.md).

## Deploy checklist (ops)

1. Ensure `casper-client` is on PATH and `CASPER_SECRET_KEY_PATH` points at a funded Testnet key.
2. Set `AGENT_ACCOUNT_HASH` and `PROOF_CONTRACT_PACKAGE_HASH`, then run `scripts/install-collateral-vault.sh`.
3. Copy contract/package hashes from the install deploy on cspr.live into Railway (`CASPER_VAULT_*` and `CASPER_VAULT_VERIFIED_*`).
4. Keep `CASPER_VAULT_ENFORCE_ENABLED=false` until `vault_demo_cycle.py` deposit+freeze+unfreeze succeeds.
5. Arm verified enforce; confirm `/api/public/proof` → `vault.verificationMode=cross_contract` and `vault.explorerUrl`.

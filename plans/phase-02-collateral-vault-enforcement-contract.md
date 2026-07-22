---
phase: 2
title: "Collateral Vault Enforcement Contract"
status: pending
priority: P1
effort: "0.75-1 day"
dependencies: [1]
---

# Phase 2: Collateral Vault Enforcement Contract

## Overview

Add a small native Casper Rust `collateral_vault` that holds testnet CSPR against a mock tokenized asset and **only** mutates state when a matching policy-gated receipt exists in the existing `casper-decision-proof` contract. The demo line becomes: the agent didn't just log a decision — it froze collateral on-chain.

## Requirements

- Functional:
  - Entry points: `deposit`, `freeze`, `unfreeze`, `set_ltv`, plus reads (`get_position`, `is_frozen`, `get_ltv`)
  - `freeze` / `unfreeze` / `set_ltv` require `decision_id` arg; contract verifies the proof contract's stored receipt for that id has an approved policy gate and a compatible action
  - At least one live freeze and one unfreeze deploy on Casper Testnet with cspr.live links
- Non-functional:
  - Keep contracts under current testnet VM constraints (no bulk-memory; match existing `casper-decision-proof` toolchain)
  - Mirror existing contract style (native `casper-contract` / `casper-types`, not Odra) for consistency unless validate chooses Odra
  - Unit-testable with `casper-test` / local runner used by existing contract

## Architecture

```
User/agent deposits CSPR ──► collateral_vault.deposit(asset_id)
                                      │
Agent loop records decision ──► decision_proof.record_decision(
                                      ... policy_gate=approved,
                                      action ∈ {approve, haircut, block, hold, warn} ...)
                                      │
Agent maps action → vault EP:
   block    → freeze
   approve  → unfreeze   (only if previously frozen)
   haircut  → set_ltv
   hold/warn → no vault mutation (decision-only)
                                      │
Agent calls vault ──► collateral_vault.<ep>(asset_id, decision_id, ...)
                                      │
                            cross-check decision_proof.get_decision_receipt(decision_id)
                                      │
                            require policy_gate==approved AND action maps to this EP
                                      │
                            mutate frozen flag / LTV; emit named-key state
```

**Verified 2026-07-22:** `guardrails.py` allowedActions = `approve | haircut | block | hold | warn`. Do **not** invent new on-chain action strings; map existing vocabulary → vault entry points so historical receipts stay coherent.

### Coupling options (pick in validate)

| Option | Pros | Cons |
|--------|------|------|
| A. Cross-contract call / uref read of proof package | Strongest "chain enforces" story | More fragile on testnet; package hash wiring |
| B. Pass receipt fields + proof digest; vault re-hashes and compares to proof contract's `latest_proof_digest` / dictionary | Simpler; still on-chain check | Slightly weaker than direct receipt read |
| C. Only agent account may call vault; receipt check off-chain | Fastest | Weakens the pitch — do not choose |

**Recommended: A if reachable in <4h; else B.** Never C.

### Minimal state

Per `asset_id` (string): `deposited_motes: u64`, `frozen: bool`, `ltv_bps: u64`, `last_decision_id: String`.
Global: `proof_contract_hash` / package hash set at install.

## Related Code Files

- Create: `contracts/collateral-vault/src/{main,install,keys}.rs` (+ Cargo.toml / Makefile mirroring decision-proof)
- Modify: `contracts/` build/deploy scripts if shared
- Create: `backend/app/services/casper/vault.py` — submit deposit/freeze/unfreeze/set_ltv via existing submitter patterns
- Modify: `backend/app/services/casper/submitter.py` or `contract.py` — add vault session args builders
- Modify: `backend/app/core/settings.py` — `casper_vault_contract_hash`, `casper_vault_package_hash`
- Create: `backend/scripts/vault_demo_cycle.py` — deposit → record decision → freeze → readback
- Modify: `README.md` — add vault to architecture + proof table

## Implementation Steps

1. Scaffold `contracts/collateral-vault` copying patterns from `casper-decision-proof` (install, named keys, dictionary if needed).
2. Implement entry points; wire `proof_contract` hash as install arg.
3. Implement receipt gate (option A or B from validate).
4. Local/contract tests: approved receipt allows freeze; missing/rejected receipt reverts; wrong action reverts.
5. Build WASM; deploy to Casper Testnet; record install tx + package hash.
6. Add backend vault service + settings; smoke-test deposit from funded account.
7. Run `vault_demo_cycle.py` end-to-end; save freeze + unfreeze cspr.live links to `proofs/`.
8. Expose vault state on public proof / dashboard read model (frozen flag, LTV, last decision id).

## Success Criteria

- [ ] Vault contract deployed on Casper Testnet with public package/contract hash
- [ ] `freeze` without approved receipt reverts (demonstrable)
- [ ] `freeze` with matching approved receipt succeeds; state readable on-chain
- [ ] `unfreeze` with matching receipt succeeds
- [ ] Backend can submit vault calls through existing signer path
- [ ] At least 2 vault mutation txs linked in `proofs/` and README

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cross-contract read unsupported / awkward | Medium | Forces option B | Spike A in first 2 hours; fall back |
| WASM size / opcode issues on testnet | Medium | Deploy fail | Copy proven decision-proof toolchain flags |
| Scope creep (multi-asset, interest, liquidations) | High | Miss deadline | Hard YAGNI: one asset id, four write EPs |
| Phase 1 slips | Medium | Vault without native x402 still mid-pack | Phase 1 remains P0; vault is P1 |

## Open Questions (for validate)

- D3: coupling option A vs B
- Contract framework: stay native Rust (Recommended) vs Odra for vault only?

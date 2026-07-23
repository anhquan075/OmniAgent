---
title: "OmniAgent Finals Hardening: Native Casper x402 + Enforcement Vault"
description: "Replace Base Sepolia x402 settlement with native Casper CEP-18 transfer_with_authorization via x402-facilitator.cspr.cloud, add a collateral vault that enforces policy-gated receipts on-chain, wire the live agent loop to freeze/unfreeze, and polish the DoraHacks proof surface before the Jul 26 finals deadline."
status: pending
priority: P1
branch: "main"
tags: [casper, x402, rwa, finals, buildathon]
blockedBy: []
blocks: []
created: "2026-07-22T17:01:46.533Z"
createdBy: "ck:plan"
source: skill
deadline: "2026-07-26"
---

# OmniAgent Finals Hardening: Native Casper x402 + Enforcement Vault

## Overview

OmniAgent already has a strong proof console (proposer/critic/policy-gate, native Rust decision-proof contract, live autonomous loop with spend caps, public verifier). Two gaps keep it off the podium in the Casper Agentic Buildathon Final Round:

1. **x402 settles on Base Sepolia, not Casper.** `backend/app/services/casper/x402_endpoint.py` uses `ExactEvmServerScheme` and actively rejects non-`eip155:` networks. Judges know Casper's own facilitator (`x402-facilitator.cspr.cloud`) settles CEP-18 `transfer_with_authorization` on casper-test today. With $100K of the $150K pool as x402 ecosystem credits, this is the single highest-impact fix.
2. **The contract records; it does not enforce.** `record_decision` is the only write entry point. Podium rivals (Wardens, Ohu, Steward) make the chain refuse actions the agent didn't authorize. A small `collateral_vault` with `deposit / freeze / unfreeze / set_ltv`, gated by a matching approved receipt, closes that gap.

Phases 3–4 turn those two upgrades into daily on-chain activity and a judge-ready DoraHacks page.

**Priority if time slips:** Phase 1 > Phase 2 > Phase 4 proof table > Phase 3 > Phase 4 CSPR.click/tagline.

## Success Criteria (plan-level)

- [ ] Live x402 evidence purchase settles a CEP-18 `transfer_with_authorization` on Casper Testnet via `x402-facilitator.cspr.cloud`, with a cspr.live tx link
- [ ] `collateral_vault` deployed; at least one live freeze and one unfreeze tied to a policy-gated receipt
- [ ] Autonomous loop keeps writing fresh decisions daily through Jul 26
- [ ] DoraHacks BUIDL page has a clickable 8–10 row proof table, simplified tagline, and named Guardrails section
- [ ] README no longer claims "facilitator path is EVM/Solana-based"

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Native Casper x402 Settlement](./phase-01-native-casper-x402-settlement.md) | Code done — live settle pending API key | 1–1.5 days |
| 2 | [Collateral Vault Enforcement Contract](./phase-02-collateral-vault-enforcement-contract.md) | Code done — testnet deploy pending | 0.75–1 day |
| 3 | [Agent Loop Live Enforcement](./phase-03-agent-loop-live-enforcement.md) | Code done — arm after vault canary | 0.5 day |
| 4 | [Submission Polish and Proof Surface](./phase-04-submission-polish-and-proof-surface.md) | In progress (docs + public proof vault) | 0.5 day |

## Key Decisions (to confirm in validate)

| # | Decision | Recommended default |
|---|----------|---------------------|
| D1 | CEP-18 source | Reuse make-software reference token (`cb65a928…`) if still settleable; else deploy own Odra/native CEP-18 with `transfer_with_authorization` |
| D2 | x402 client approach | Replace `ExactEvmServerScheme` middleware with a Casper-native facilitator client (verify + settle against `x402-facilitator.cspr.cloud`), keep existing receipt-binding into proof digests |
| D3 | Vault ↔ proof coupling | Cross-contract read of `get_decision_receipt` / `latest_policy_gate`; vault entry points revert unless `policy_gate == "approved"` (or equivalent) for the referenced `decision_id` |
| D4 | Scope if time slips | Ship Phase 1 + Phase 4 proof table even if vault slips; never ship vault without Phase 1 |
| D5 | CSPR.click | Include in Phase 4 only if Phases 1–2 are green by Jul 24 evening |

## Critical Code Paths (verified 2026-07-22)

| Path | Role | Relevant fact |
|------|------|---------------|
| `backend/app/core/settings.py:77-81` | Defaults | `casper_x402_facilitator_url=https://x402.org/facilitator`, `casper_x402_network=eip155:84532`, currency USDC |
| `backend/app/services/casper/x402_endpoint.py` | Paywall | Imports `ExactEvmServerScheme`; `setup_blockers` rejects non-`eip155:` |
| `backend/app/services/casper/x402.py` | Receipt binding | Already normalizes/binds receipts into proof digests — **keep** |
| `contracts/casper-decision-proof/src/main.rs` | On-chain proof | Only write EP: `record_decision`; read EPs for receipt/digest |
| `backend/app/services/casper/submitter.py` | Deploy path | Existing casper-client submission + readback — reuse for vault calls |
| `backend/app/services/casper/loop.py` + `submission_guard.py` | Live loop | Caps, dedupe, reserve already enforced |

## Reference Implementations (external)

- KaJota Coach `agent/CASPER.md` — Casper x402 wire format (`amount` vs `maxAmountRequired`, `"00"`-prefixed `payTo`, `extra.version` EIP-712 domain, `transfer_with_authorization`)
- CasCet — reused make-software CEP-18 package `hash-cb65a928f8e1b7ce172bddd075c10dd0de8bcfd9cf808c799fd409766a1735c3`
- CSPR.cloud facilitator — `https://x402-facilitator.cspr.cloud` (`/verify`, `/settle`)

## Risks

| Risk | Mitigation |
|------|------------|
| Facilitator / CEP-18 domain mismatch → settlement reject | Follow KaJota wire-format checklist; add a one-shot settle script with negative (tamper) proof |
| Cross-contract receipt read fails on testnet VM | Prefer querying stored receipt fields via named keys / dictionary; fall back to passing a receipt hash the vault re-hashes and matches against proof contract |
| Live loop burns budget during vault bring-up | Keep existing caps; arm vault actions behind a separate feature flag |
| Deadline overrun | Cut CSPR.click and multi-asset vault; keep Phase 1 + proof table mandatory |

## Out of Scope

- Mainnet deployment
- Multi-collateral / multi-asset vault
- Replacing native Rust decision-proof with Odra
- Changing the proposer/critic LLM stack
- Full KYC / institutional compliance registry (Steward's lane)

## Dependencies

None (greenfield hardening on existing OmniAgent codebase).

## Validation Log

### Verification Results (pre-interview)
- Claims checked: 12
- Verified: 10 | Failed: 0 | Unverified: 2
- Tier: Standard (4 phases → Fact Checker + Contract Verifier)
- Key verified facts:
  - `x402_endpoint.py` used `ExactEvmServerScheme` + rejected non-`eip155:` (fixed in Phase 1)
  - Defaults pointed at `x402.org` / `eip155:84532` / USDC (fixed → CSPR.cloud / `casper:casper-test` / WCSPR)
  - Decision-proof contract write surface is only `record_decision`
  - Live caps exist: 2.5 CSPR/tx, 4/day, 10 CSPR/day, 50 CSPR reserve
  - Policy actions are `approve|haircut|block|hold|warn` — vault maps, does not invent
  - Dep pin `x402[evm,fastapi]>=2.14.0` — Phase 1 uses HTTP facilitator client (no EVM scheme)

### Session 1 — 2026-07-22
**Trigger:** User waived interview ("don't care about the deadline just do it") → lock Recommended defaults and implement.
**Questions asked:** 8 (auto-answered Recommended)

#### Confirmed Decisions
- D1 CEP-18: reuse make-software reference token `cb65a928…`, env-overrideable — Recommended
- D2 Vault coupling: receipt parse + approved gate (option B); proof hash stored at install — Recommended practical path
- D3 Vault framework: native Rust like decision-proof — Recommended
- D4 Buyer key: separate funded buyer wallet when settling live — Recommended
- D5 Scope: full build (user waived deadline cuts)
- D6 Caps: vault deploys share existing daily caps — Recommended
- D7 CSPR.click + video: stretch — Recommended
- D8 Wording: honest until live, then flip — Recommended (README flipped after code change)

#### Action Items
- [x] Phase 1 native Casper x402 client + route gate + tests
- [x] Phase 2 collateral-vault contract + WASM + backend service
- [x] Phase 3 loop vault enforcement after readback
- [x] Public proof `vault` surface + install/demo scripts + DoraHacks draft
- [ ] Deploy vault to testnet + arm env on Railway
- [ ] Live settle with facilitator API key + paste cspr.live links
- [ ] Paste DoraHacks description from `docs/dorahacks-finals-description.md` (fill rows 6–10 after canaries)

### Whole-Plan Consistency Sweep
- No remaining `eip155` defaults in settings/.env.example
- Action mapping documented consistently in vault README + vault.py + phase docs
- Unresolved: live facilitator settle requires user's CSPR.cloud API key (not in repo)
- Unresolved: vault deploy requires `casper-client` + funded secret key on the operator machine

---
phase: 3
title: "Agent Loop Live Enforcement"
status: pending
priority: P2
effort: "0.5 day"
dependencies: [1, 2]
---

# Phase 3: Agent Loop Live Enforcement

## Overview

Teach the existing autonomous loop to act on its own decisions: when the policy gate approves a freeze/unfreeze/set_ltv action, the loop submits the matching vault call after `record_decision`, subject to the same spend caps, dedupe, and reserve. Goal: daily fresh txs through Jul 26 that show enforcement, not just logging.

## Requirements

- Functional:
  - Loop maps approved actions → vault entry points
  - Vault call happens only after decision receipt is confirmed via existing readback
  - Failures in vault call are ledgered; they must not brick the loop
- Non-functional:
  - No relaxation of `casper_live_*` caps / min balance
  - Feature-flagged (`casper_vault_enforce_enabled`) so canary can arm separately from decision logging
  - Dashboard/public proof shows last vault action + tx hash

## Architecture

```
loop cycle
  ├─ fetch evidence (now paid via native Casper x402 from Phase 1)
  ├─ proposer / critic / policy gate
  ├─ if approved + live_submit:
  │     record_decision ──► wait readback
  │     if vault_enforce_enabled and action in {freeze,unfreeze,set_ltv}:
  │           vault.<action>(asset_id, decision_id)
  │           ledger vault tx
  └─ sleep interval (keep ~1800s or existing prod value)
```

Reuse: `loop.py`, `submission_guard.py`, `submitter.py`, `ledger.py`, `cycle_history.py`.

## Related Code Files

- Modify: `backend/app/services/casper/loop.py` — post-readback vault dispatch
- Modify: `backend/app/services/casper/guardrails.py` / `submission_guard.py` — count vault deploys toward daily caps if they cost gas
- Modify: `backend/app/core/settings.py` — `casper_vault_enforce_enabled`, default asset id
- Modify: `backend/app/services/casper/public_proof.py` + frontend proof tabs — surface vault txs
- Modify: Railway/env — arm flag after canary

## Implementation Steps

1. Add settings flag + default `asset_id` for demo collateral.
2. Implement vault dispatcher in loop after successful decision readback.
3. **Map existing actions → vault EPs** (do not extend the on-chain action enum): `block→freeze`, `approve→unfreeze`, `haircut→set_ltv`, `hold|warn→decision-only`. Keep receipt `action` strings unchanged so historical proofs stay valid.
4. Extend ledger event schema with `vaultTxHash`, `vaultAction`.
5. Canary: one manual freeze cycle in prod with flag on; confirm caps still hold.
6. Leave loop running through Jul 26; verify ≥1 vault mutation/day lands on explorer.
7. Update public proof JSON so judges see the latest vault tx without opening Railway logs.

## Success Criteria

- [ ] With flag off, behavior equals today (decision-only)
- [ ] With flag on, approved freeze produces vault tx linked to decision id
- [ ] Caps/reserve still halt the loop when tripped
- [ ] Public proof endpoint includes latest vault action + cspr.live URL
- [ ] ≥3 vault-related txs on testnet by deadline (canary + 2 autonomous)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Action enum mismatch with historical receipts | Medium | Confusing proofs | Version actions or namespace vault actions (`vault_freeze`) |
| Double-freeze / idempotency | Medium | Revert noise | Vault no-ops if already frozen; loop treats revert-as-noop as soft success |
| Gas burn from extra deploys | Low | Hit daily budget | Count vault deploys in daily budget; optionally alternate freeze/unfreeze sparingly |

## Open Questions (for validate)

- Should vault actions share the 4-submissions/day cap with `record_decision`, or get a separate small cap (e.g. +2/day)?

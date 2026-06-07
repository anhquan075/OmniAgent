---
phase: 3
title: Competition Registration Proof
status: completed
priority: P1
effort: 4h
dependencies:
  - 1
  - 2
---

# Phase 3: Competition Registration Proof

## Overview

Register the actual TWAK/agent wallet on-chain for BNB Hack Track 1 and store the proof. Dry-run instructions are not enough for final readiness.

## Requirements

- Functional: the registered wallet must match the TWAK execution wallet and configured agent wallet.
- Functional: registration must target the official competition contract from config.
- Functional: submitted registration must produce a valid BSC tx hash, BscScan URL, and ledger event.
- Non-functional: live registration is guarded by `BNB_COMPETITION_REGISTRATION_ENABLED=true`.

## Architecture

`wallet status -> TWAK status -> bnb_competition_register(submit=false) -> enable registration guard -> bnb_competition_register(submit=true) -> tx hash -> receipt/status -> ledger/proof bundle`

Prefer the backend MCP tool as the proof source. If the REST bridge lacks `competition_register`, fall back to the TWAK CLI surface already known from prior work: `twak compete register` and `twak compete status`, then record the tx through the backend ledger path.

## Related Code Files

- Inspect/modify: `backend/app/services/trading/registration.py`
- Inspect/modify: `backend/app/services/twak/bridge.py`
- Inspect/modify: `backend/app/services/twak/cli.py`
- Inspect/modify: `backend/app/services/twak/rest.py`
- Inspect/modify: `backend/app/services/agent/cockpit.py`
- Inspect/modify: `backend/data/trade-ledger.jsonl`

## Implementation Steps

1. Confirm the wallet:
   - TWAK CLI wallet address for BSC
   - backend `bnb_get_wallet`
   - configured `ROBOT_FLEET_AGENT_WALLET` / `TWAK_AGENT_WALLET`
2. Confirm `bnb_competition_register` dry-run returns the correct contract and wallet.
3. Enable only the registration guard, not trading flags, if possible:
   - `BNB_COMPETITION_REGISTRATION_ENABLED=true`
4. Submit registration through the backend tool if supported.
5. If backend REST registration is blocked by missing TWAK route, run `twak compete register` manually with the configured wallet and then record the proof:
   - `cd backend && .venv/bin/python scripts/record-bnb-competition-registration.py --tx-hash <bsc-registration-tx-hash>`
6. Verify `competition_registered` exists in the ledger with tx hash, contract, wallet, timestamp, and explorer URL.
7. Re-run `bnb_live_preflight`; the competition blocker should clear.

## Success Criteria

- [x] Registration wallet equals the TWAK execution wallet.
- [x] Registration tx hash is a valid BSC hash and has a BscScan URL.
- [x] Ledger contains `competition_registered`.
- [x] `bnb_live_preflight` no longer blocks on competition registration.
- [x] No live trade has been submitted in this phase.

## Risk Assessment

Risk: TWAK registration requires wallet unlock/password outside Codex access. Mitigation: stop at exact command and proof-recording instructions; do not alter wallet config blindly.

Risk: wrong wallet registration disqualifies proof. Mitigation: hard-check TWAK observed wallet against backend configured wallet before submitting.

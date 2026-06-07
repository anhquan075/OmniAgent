---
phase: 5
title: "Submission Gate"
status: completed
priority: P1
effort: "4h"
dependencies: [1, 2, 3, 4]
---

# Phase 5: Submission Gate

## Overview

Package the proof chain into a judge-readable submission bundle and block submission if any live proof is missing or stale.

## Requirements

- Functional: final bundle must include CMC signal proof, competition registration proof, TWAK status, trade tx, receipt proof, ledger path, daily compliance, PnL/drawdown state, and emergency pause state.
- Functional: docs must tell judges exactly what was live and what was intentionally guarded.
- Functional: secret scan and verification commands must pass.
- Non-functional: no private keys, CMC keys, TWAK secrets, or dotenv contents in reports/docs/git.

## Architecture

`bnb_live_proof_bundle -> plans/reports/final-live-proof-*.md -> docs/bnb-hack-submission.md -> docs/bnb-hack-live-trading-runbook.md -> final verification commands`

Submission docs should link to proof artifacts and BscScan URLs, not ask judges to infer proof from source code.

## Related Code Files

- Inspect/modify: `backend/app/services/trading/proof_bundle.py`
- Inspect/modify: `docs/bnb-hack-submission.md`
- Inspect/modify: `docs/bnb-hack-live-trading-runbook.md`
- Inspect/modify: `docs/bnb-hack-demo-script.md`
- Inspect/modify: `scripts/check-secrets.sh`
- Create: `plans/reports/final-bnb-hack-live-proof-YYYYMMDD.md`

## Implementation Steps

1. Call `bnb_live_proof_bundle` after the confirmed trade.
2. Create a final report under `plans/reports/` with:
   - agent wallet
   - CMC Agent Hub tool and timestamp
   - competition registration tx and BscScan URL
   - trade tx and BscScan URL
   - receipt proof fields
   - daily compliance
   - PnL/drawdown state
   - emergency pause status
3. Update submission/runbook docs to remove stale `backend_fastapi` commands.
4. Run final backend verification:
   - `.venv/bin/python -m pytest -q` from `backend`
   - `.venv/bin/python -m compileall -q app tests scripts` from `backend`
   - `rtk uv --project backend run ruff check .` from repo root
5. Run secret scan:
   - `rtk bash scripts/check-secrets.sh` if available
6. Review `rtk git status --short` and make sure no dotenv, private key, or generated sensitive ledger dump is staged.
7. Submit only if all gates pass.

## Success Criteria

- [x] Final proof report exists under `plans/reports/`.
- [x] Submission docs use active backend commands.
- [x] Final verification commands pass.
- [x] Secret scan passes.
- [x] No secrets or private env files are included in git status.
- [x] The remaining unresolved items are operator/external only, not backend defects.

## Risk Assessment

Risk: ledger contains sensitive operational details. Mitigation: final report should include proof hashes/URLs and redacted summaries, not raw secret-bearing payloads.

Risk: docs overclaim. Mitigation: state exactly which live proofs are completed and which live-window daily-trade obligations remain ongoing.

---
phase: 4
title: "TWAK Trade Receipt Proof"
status: completed
priority: P1
effort: "5h"
dependencies: [1, 2, 3]
---

# Phase 4: TWAK Trade Receipt Proof

## Overview

Submit one tiny real BSC mainnet trade through TWAK, then validate the transaction and receipt in the backend ledger. This is the final "sign and execute" Track 1 proof.

## Requirements

- Functional: live trade requires green `bnb_live_preflight`.
- Functional: trade must be signed/executed through TWAK REST or CLI, not a fallback signer.
- Functional: receipt proof must validate sender wallet, target venue or TWAK REST executor proof, calldata selector, success status, and BscScan URL.
- Functional: ledger must include both `trade_executed` and `trade_receipt_confirmed`.
- Non-functional: default amount remains tiny, e.g. `0.25` USD, unless operator explicitly changes it.

## Architecture

`configure live flags -> bnb_live_preflight -> bnb_run_autonomous_cycle(execute=true) -> TWAK swap -> txHash -> bnb_get_trade_status -> receipt proof -> bnb_live_proof_bundle`

Do not bypass `run-bnb-live-cycle.py`; its explicit real-trade flag is useful friction.

## Related Code Files

- Inspect/modify: `backend/scripts/run-bnb-live-cycle.py`
- Inspect/modify: `backend/scripts/run-bnb-live-loop.py`
- Inspect/modify: `backend/app/services/agent/autonomous_cycle.py`
- Inspect/modify: `backend/app/services/trading/execution.py`
- Inspect/modify: `backend/app/services/trading/receipt.py`
- Inspect/modify: `backend/app/services/trading/proof_bundle.py`
- Inspect/modify: `backend/app/services/shared/ledger.py`

## Implementation Steps

1. Re-run live-mode readiness:
   - `cd backend && .venv/bin/python scripts/check-bnb-mainnet-readiness.py --api-url http://127.0.0.1:8000 --live`
2. Enable live flags only after readiness is clean:
   - `BNB_TRADING_ENABLED=true`
   - `ALLOW_AGENT_RUN=true`
3. Submit one tiny trade:
   - `cd backend && .venv/bin/python scripts/run-bnb-live-cycle.py --api-url http://127.0.0.1:8000 --amount-usd 0.25 --slippage-bps 50 --i-understand-this-trades-real-bsc-mainnet`
4. Poll status until confirmed:
   - call `bnb_get_trade_status` with the tx hash returned by the script.
5. Confirm `proof.valid=true` and reasons are empty.
6. Confirm the ledger has `trade_executed` and `trade_receipt_confirmed` for the same tx hash.
7. If receipt is pending, wait/retry; do not resubmit another trade until the first tx is classified.
8. Immediately test `bnb_emergency_pause` and restore only if another live-window trade is planned.

## Success Criteria

- [x] A real BSC tx hash is returned by TWAK-backed execution.
- [x] `bnb_get_trade_status` returns `status=confirmed`, `success=true`, and `proof.valid=true`.
- [x] Ledger stores submitted and confirmed trade events for the same tx hash.
- [x] CMC Agent Hub signal proof is attached to the trade evidence.
- [x] Emergency pause path is verified after the trade.

## Risk Assessment

Risk: trade fails due to token approval/native token handling. Mitigation: use the preflight-derived funded route and one tiny amount; patch only the boundary that failed.

Risk: receipt proof rejects TWAK REST executor routing. Mitigation: preserve `bridgeMode`, wallet address, and `serverVerified` signal in submission proof so REST execution can be validated without pretending the router was directly called.

Risk: repeated live attempts increase loss/noise. Mitigation: one trade at a time; classify pending/failed before retrying.

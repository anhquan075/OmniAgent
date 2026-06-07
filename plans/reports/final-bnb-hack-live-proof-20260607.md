# Final BNB Hack Live Proof - 2026-06-07

## Scope

This report records the first complete Track 1 live-proof chain for the active FastAPI backend: live CMC Agent Hub signal, on-chain competition registration, TWAK-signed BSC trade, receipt validation, ledger proof, and post-run emergency pause.

## Wallet And Contract

- Agent wallet: `0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25`
- Network: BSC mainnet, chain id `56`
- Competition contract: `0x212c61b9b72c95d95bf29cf032f5e5635629aed5`
- TWAK execution mode: REST bridge at local `localhost:8787`, wallet-validated before live execution

## Live CMC Signal

- Source: CoinMarketCap Agent Hub MCP
- Tool: `trending_crypto_narratives`
- Server verified: `true`
- Signal timestamp: `2026-06-07T05:02:48.162519+00:00`
- Signal evidence attached to ledger event: `backend/data/trade-ledger.jsonl:234`

## Competition Registration

- Status: registered on-chain and recorded locally
- Registration tx: `0xc9e4e4ca69156d20da4f8b5f343ee1354dfac72c40363d8e6d32b51f712c3cf4`
- Explorer: `https://bscscan.com/tx/0xc9e4e4ca69156d20da4f8b5f343ee1354dfac72c40363d8e6d32b51f712c3cf4`
- Ledger event: `competition_registered` at `backend/data/trade-ledger.jsonl:218`

## TWAK Trade Receipt

- Live command: `cd backend && .venv/bin/python scripts/run-bnb-live-cycle.py --api-url http://127.0.0.1:8000 --amount-usd 0.05 --slippage-bps 50 --i-understand-this-trades-real-bsc-mainnet`
- Trade tx: `0x6a1ab4dd0275f0e51756bdb6b18c7805b0e022a95c8c8f70707b09cf839063f9`
- Explorer: `https://bscscan.com/tx/0x6a1ab4dd0275f0e51756bdb6b18c7805b0e022a95c8c8f70707b09cf839063f9`
- Receipt status: `confirmed`
- Receipt success: `true`
- Block: `102780454`
- Sender: `0x047fccc4b2c0058ecfcf331ca7590f227886fd25`
- TWAK REST executor target: `0x3d90f66b534dd8482b181e24655a9e8265316be9`
- Receipt proof: `valid=true`, `reasons=[]`, `bridgeMode=rest`
- Ledger events:
  - `trade_executed` at `backend/data/trade-ledger.jsonl:234`
  - `trade_receipt_confirmed` at `backend/data/trade-ledger.jsonl:236`

## Proof Bundle Snapshot

`bnb_live_proof_bundle` after receipt validation returned:

- `status=ready_for_live_trade`
- `readyForLiveTrade=true`
- `blockers=[]`
- `latestSubmission.txHash=0x6a1ab4dd0275f0e51756bdb6b18c7805b0e022a95c8c8f70707b09cf839063f9`
- `latestReceiptStatus.status=confirmed`
- `latestReceiptStatus.success=true`
- Daily compliance: `progress=1/7`, `submittedProgress=2/7`
- `nextActions=[]`

## Emergency Pause

After the proof trade, the local emergency pause was enabled to prevent accidental additional live trades.

- Tool: `bnb_emergency_pause` with `enabled=true`
- Ledger event: `backend/data/trade-ledger.jsonl:240`
- Follow-up risk check returned `approved=false` with reason `emergency_pause_enabled`
- Risk-check ledger event: `backend/data/trade-ledger.jsonl:241`

## Verification

Completed after the emergency-pause ledger patch:

- `cd backend && .venv/bin/python -m pytest -q` -> `91 passed, 2 warnings`
- `cd backend && .venv/bin/python -m compileall -q app/services/adapters/runtime.py app/services/shared/ledger.py tests/test_mcp_contract.py` -> passed
- `cd backend && .venv/bin/python -m ruff check app tests scripts` -> passed
- `rtk bash scripts/check-secrets.sh` -> passed

## Remaining Operator Notes

- Daily live-window compliance is ongoing: Track 1 still needs daily qualifying operation during the official live window.
- The emergency pause is currently enabled in the local ledger. Disable only for the next intentional live trade window with `bnb_emergency_pause` using `enabled=false`.

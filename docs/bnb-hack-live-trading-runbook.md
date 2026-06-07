# BNB Hack Live Trading Runbook

Use this runbook for the BNB Hack live trading window on BSC mainnet.

## 1. Pre-Window Checks

Deadline: complete registration before June 22, 2026.

- Confirm the official BNB competition registration contract from the organizer source: `0x212c61b9b72c95d95bf29cf032f5e5635629aed5`.
- Set private deployment secrets outside Git: one CMC key (`CMC_AGENT_HUB_API_KEY`, `CMC_MCP_API_KEY`, `CMC_PRO_API_KEY`, `COINMARKETCAP_API_KEY`, or `X_CMC_PRO_API_KEY`), `CMC_SKILL_HUB_API_KEY` if using hosted skills, `TW_ACCESS_ID`, `TW_HMAC_SECRET`, and `TRUST_WALLET_AGENT_KIT_CONFIG`.
- Install and pin the Python BNB Agent SDK package used by the backend identity service; keep `BNB_AGENT_SDK_NETWORK=bsc-mainnet` and submit identity only through `bnb_agent_sdk_register_identity`.
- Keep `BNB_TRADING_ENABLED=false` until wallet, TWAK readiness, CMC signal health, and risk checks are verified.
- Run `bnb_get_wallet` and confirm `network` is `bsc`, SDK credential readiness is boolean-only, and no secret values are returned.
- Run `bnb_agent_sdk_status` and `bnb_agent_cockpit_snapshot` to confirm the BNB SDK bridge, identity proof, competition progress, TWAK status, and registration gaps are visible. Submit identity only through `bnb_agent_sdk_register_identity` when the operator is ready for a BSC mainnet identity transaction.
- Run `bnb_paid_resource_status` and confirm x402 is either verified-ready or clearly `not_claimed` with missing env listed.
- Run `bnb_competition_register` first with `submit=false` to review fallback instructions. Then run with `submit=true` only when `BNB_COMPETITION_REGISTRATION_ENABLED=true` and TWAK registration is configured.
- If TWAK registration is submitted manually with `twak compete register`, record the returned BSC tx hash with `(cd backend && .venv/bin/python scripts/record-bnb-competition-registration.py --tx-hash <bsc-registration-tx-hash>)` before re-running preflight.
- Save both tx hashes: SDK identity registration and competition registration. A fallback command without tx hash is not completed registration.
- After exporting one CMC key in the shell, run `(cd backend && .venv/bin/python scripts/configure-bnb-live-env.py --enable-live)`, then restart FastAPI before the final live readiness check.

## 2. Wallet Funding

- Fund only the competition wallet selected for BSC mainnet trading.
- Keep enough BNB for gas and enough allowlisted quote/token balance for the planned PancakeSwap spot trades.
- Run `bnb_get_wallet` and `bnb_simulate_trade` before enabling live trading.
- Do not store private keys, mnemonic phrases, API keys, or HMAC secrets in tracked files.

## 3. Daily Trading Loop

Competition trading window: June 22-28, 2026.

Daily checklist:

- Run `cmc_get_price_snapshot` for the target allowlisted symbol.
- Confirm the strategy decision is based on a current CMC timestamp and source metadata.
- Run `bnb_risk_check` for the proposed symbol, side, and amount.
- Verify the dashboard quote/simulation stage shows BSC mainnet PancakeSwap routing.
- Confirm the TWAK readiness reason is expected.
- Enable `BNB_TRADING_ENABLED=true` only for the approved live execution window.
- Let the autonomous backend execute through `bnb_run_autonomous_cycle`; `bnb_execute_trade` remains blocked unless the same live flags and proof gates pass.
- Run `bnb_trade_ledger_summary` and confirm daily compliance, tx evidence, PnL, drawdown, and pause state.
- Count a day as qualified only when the trade ledger has `trade_receipt_confirmed` with `proof.valid=true`.
- Run `bnb_live_proof_bundle` and confirm `workOrderLifecycle`, `proofScore`, `proofDigest`, `duplicateProof`, and `recoveryCandidates` are present. Hard blockers must be resolved before live execution even when partial score fields are true.

## 4. Pause And Recovery

Pause immediately if CMC signal freshness, RPC health, TWAK readiness, quote routing, risk checks, or receipt polling are abnormal.

- Run `bnb_emergency_pause` with `enabled=true`.
- Confirm `bnb_trade_ledger_summary` reports `control.emergencyPaused=true`.
- Capture the blocking reason and latest ledger events.
- Do not resume until a fresh quote, simulation, and risk check pass.
- Use recovery candidates as repair hints only. They can poll receipts, repair ledger evidence, refresh CMC signal proof, validate TWAK, or record external registration proof; they must not submit a new live trade by default.
- Resume with `bnb_emergency_pause` using `enabled=false`.

## 5. Evidence Export

Current completed live proof:

- Competition wallet: `0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25`
- Competition registration transaction: `0xc9e4e4ca69156d20da4f8b5f343ee1354dfac72c40363d8e6d32b51f712c3cf4`
- First TWAK-signed BSC trade transaction: `0x6a1ab4dd0275f0e51756bdb6b18c7805b0e022a95c8c8f70707b09cf839063f9`
- Final proof report: `plans/reports/final-bnb-hack-live-proof-20260607.md`
- Local emergency pause is enabled after the proof run; disable it only for the next intentional live trade window.

For each trading day, save:

- CMC signal or Skill Hub output metadata.
- Strategy intent id and risk decision.
- Quote and simulation output.
- Submitted transaction hash and receipt status.
- Transaction proof with chain id `56`, registered wallet sender, PancakeSwap target, allowlisted token path, receipt status, block number, confirmations, and BscScan URL.
- `bnb_trade_ledger_summary` output.
- `bnb_live_proof_bundle` output showing lifecycle, proof score, duplicate digest, and read-only recovery candidates.
- Dashboard screenshot showing SDK identity proof, competition registration proof, signal, risk, verified daily trade state, PnL, drawdown, and emergency pause.

## 6. Verification Commands

Before submission or push:

```bash
# Terminal 1: start the TWAK bridge and keep it running.
twak serve --rest --host localhost --port 8787

# Terminal 2: run dry verification.
(cd backend && .venv/bin/python -m pytest -q)
(cd backend && .venv/bin/python -m compileall -q app tests scripts)
(cd backend && .venv/bin/python scripts/smoke-cmc-tool.py)
(cd backend && .venv/bin/python scripts/check-bnb-mainnet-readiness.py)
scripts/verify-legwork-mechanism-fit.sh
(cd frontend && rtk pnpm run build)
(cd frontend && rtk pnpm exec vitest run)
(cd frontend && rtk pnpm exec playwright test e2e/tests/bnb-mcp-api.spec.ts e2e/tests/bnb-cockpit-layout.spec.ts e2e/tests/bnb-trading-dashboard.spec.ts --project=chromium)
```

Run `(cd backend && .venv/bin/python scripts/check-bnb-mainnet-readiness.py --live)` only after intentionally enabling `BNB_TRADING_ENABLED=true` and `ALLOW_AGENT_RUN=true`; live mode treats TWAK, SDK, CMC, registration, and capital gaps as errors.

## 7. Submission Placeholders

Fill these after live registration and demo capture:

- Competition wallet: `0x047fCCc4B2c0058EcfcF331ca7590F227886Fd25`
- BNB SDK identity transaction:
- Competition registration transaction: `0xc9e4e4ca69156d20da4f8b5f343ee1354dfac72c40363d8e6d32b51f712c3cf4`
- First qualifying daily trade transaction: `0x6a1ab4dd0275f0e51756bdb6b18c7805b0e022a95c8c8f70707b09cf839063f9`
- Demo URL:
- DoraHacks BUIDL URL:

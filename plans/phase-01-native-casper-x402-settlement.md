---
phase: 1
title: "Native Casper x402 Settlement"
status: pending
priority: P1
effort: "1-1.5 days"
dependencies: []
---

# Phase 1: Native Casper x402 Settlement

## Overview

Replace the Base Sepolia / `ExactEvmServerScheme` paywall with native Casper settlement: a CEP-18 asset with `transfer_with_authorization`, signed off-chain by the buyer, verified and settled by `x402-facilitator.cspr.cloud`. Keep the existing receipt-binding into decision proof digests — only the payment rail changes.

## Requirements

- Functional:
  - `GET /api/x402/rwa-evidence` returns HTTP 402 with Casper network / CEP-18 asset / payTo / amount when unpaid
  - A valid signed `transfer_with_authorization` settles on Casper Testnet via the CSPR.cloud facilitator; response includes settlement tx hash
  - Settled receipt remains hash-bound into the decision proof (`bindingStatus=bound`)
  - Tampered payTo / amount is rejected by the facilitator (negative proof)
- Non-functional:
  - No private keys in git; payTo is a funded CEP-18 holder controlled by the project
  - Existing dry-run / live-submit guards unchanged
  - Unit tests cover wire-format construction without network; one integration script settles live

## Architecture

```
Buyer / agent
   │  GET /api/x402/rwa-evidence
   ▼
FastAPI paywall (NEW Casper scheme, NOT ExactEvmServerScheme)
   │  402: network=casper:casper-test, asset=<CEP-18 package>, payTo, amount, extra.version
   ▼
Buyer signs EIP-712 transfer_with_authorization (casper-js-sdk or Python equiv)
   │  retry with X-PAYMENT header
   ▼
x402-facilitator.cspr.cloud  POST /verify → POST /settle
   │  on-chain CEP-18 transfer
   ▼
200 + evidence payload + settlementTxHash
   │
   ▼
CasperX402EvidenceService binds receipt → proof digest (EXISTING path, keep)
```

### Key design choices

1. **Drop `ExactEvmServerScheme` and the `eip155:` blocker.** Verified: `x402_endpoint.py` imports `ExactEvmServerScheme`, registers it at line ~118, and `setup_blockers` rejects non-`eip155:` at lines 34–35. Dependency pin is `x402[evm,fastapi]>=2.14.0` in `backend/pyproject.toml` — there is no Casper extra. **Do not stretch the EVM SDK**; call the Casper facilitator over HTTP (KaJota pattern) and optionally drop the `evm` extra later.
2. **CEP-18 asset:** prefer reusing the make-software reference token (`hash-cb65a928…`) if the facilitator still accepts it; otherwise deploy a minimal Odra/native CEP-18 with `transfer_with_authorization` under `contracts/cep18-x402/`.
3. **Facilitator URL default:** `https://x402-facilitator.cspr.cloud` (override via env).
4. **Wire-format gotchas (from KaJota CASPER.md):**
   - Prefer `amount` / confirm whether facilitator expects `maxAmountRequired`
   - `payTo` often needs `"00"`-prefixed account-hash form
   - EIP-712 domain must include `extra.version`
   - Asset is the CEP-18 package hash, not native CSPR
5. **Receipt binding stays.** `CasperX402EvidenceService` already normalizes and binds — only change the network/currency fields it expects (`CSPR` or token symbol, `casper:casper-test`).

## Related Code Files

- Modify: `backend/app/core/settings.py` — defaults for facilitator, network, currency, asset package hash
- Modify: `backend/app/services/casper/x402_endpoint.py` — replace EVM middleware with Casper facilitator client
- Modify: `backend/app/services/casper/x402.py` — accept Casper network receipts; drop Base-only assumptions
- Modify: `backend/tests/` — unit tests for 402 payload + receipt binding
- Create: `backend/scripts/settle_x402_casper_once.py` — one-shot live settle + print cspr.live link
- Create (conditional): `contracts/cep18-x402/` — only if reference token is unusable
- Modify: `README.md` — remove "facilitator path is EVM/Solana-based"; document Casper settlement

## Implementation Steps

1. Confirm facilitator reachability: `curl` `/supported` (or equivalent) on `x402-facilitator.cspr.cloud`; record accepted networks/schemes.
2. Decide CEP-18: probe make-software package on testnet; if facilitator rejects, scaffold + deploy own token; fund payTo + a buyer test account with tokens.
3. Rewrite `CasperX402EvidenceEndpointService`:
   - Remove `ExactEvmServerScheme` / `eip155:` hard requirement
   - Emit Casper 402 challenge matching facilitator schema
   - On retry: forward signed authorization to facilitator `/verify` then `/settle`
   - On success: attach `settlementTxHash` to response + build receipt for binder
4. Update settings defaults (`casper_x402_facilitator_url`, `casper_x402_network=casper:casper-test`, currency, asset package hash, payTo).
5. Adapt `CasperX402EvidenceService` receipt schema for Casper fields; keep `bindingStatus` / hash logic.
6. Add unit tests (no network) for challenge shape + tamper rejection path (mock facilitator 400).
7. Run `settle_x402_casper_once.py` against live testnet; save cspr.live link into `proofs/`.
8. Update public proof payload so dashboard shows Casper network + settlement tx (not Base).
9. Update README "Current Public Deployment" table and kill the EVM justification sentence.

## Success Criteria

- [ ] `setup_blockers` no longer requires `eip155:`
- [ ] Unpaid `GET /api/x402/rwa-evidence` returns HTTP 402 with Casper network + CEP-18 asset
- [ ] Live settle script produces a processed CEP-18 transfer on `testnet.cspr.live`
- [ ] Decision proof still shows `bindingStatus=bound` with the new receipt
- [ ] Tampered payTo is rejected (negative proof script or documented click-path)
- [ ] README no longer mentions Base Sepolia / EVM facilitator as the settlement path
- [ ] Unit tests for challenge + binder pass in CI/local

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Wire-format mismatch with facilitator | High | Blocks Phase 1 | Follow KaJota checklist; iterate with facilitator error bodies |
| Reference CEP-18 not usable | Medium | +0.5 day | Pre-bake own token WASM; deploy early |
| Python x402 SDK has no Casper scheme | High | Rewrite needed | Don't force EVM SDK — call facilitator HTTP directly (KaJota pattern) |
| Breaking existing dashboard x402 status badges | Medium | UX regression | Keep readiness shape; only change network/currency fields |

## Open Questions (for validate)

- D1: reuse make-software CEP-18 vs deploy own?
- Buyer key for demo: reuse agent key (simpler) vs separate buyer wallet (cleaner narrative)?

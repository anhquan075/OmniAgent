# OmniAgent Finals — DoraHacks BUIDL description (paste into dorahacks.io/buidl/40823)

**Short tagline:**
AI agents make RWA risk calls nobody can audit. OmniAgent turns every decision into a Casper-verifiable receipt — and enforces it on-chain.

**Full description:** see prior chat draft; update the x402 section to:

## x402 evidence rail — native Casper settlement

The agent's premium RWA evidence sits behind a real x402 paywall:

- Facilitator: `https://x402-facilitator.cspr.cloud`
- Network: `casper:casper-test`
- Asset: CEP-18 with `transfer_with_authorization` (make-software WCSPR reference package by default)
- Unpaid `GET /api/x402/rwa-evidence` → HTTP 402 with Casper `accepts[]`
- Paid retry → facilitator `/verify` + `/settle` → CEP-18 transfer on Casper Testnet
- Settlement tx hash is bound into the decision proof receipt

## Collateral vault enforcement

`collateral-vault` contract maps policy actions to on-chain state:

- `block` → `freeze`
- `approve` → `unfreeze`
- `haircut` → `set_ltv`

Freeze/unfreeze/set_ltv require an approved decision-proof receipt string. The autonomous loop can arm vault enforcement after verified readback (`CASPER_VAULT_ENFORCE_ENABLED=true`).

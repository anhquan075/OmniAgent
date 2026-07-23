# OmniAgent Finals — DoraHacks BUIDL description (paste into dorahacks.io/buidl/40823)

**Short tagline:**
AI agents make RWA risk calls nobody can audit. OmniAgent turns every decision into a Casper-verifiable receipt — and enforces it on-chain.

## What it does

OmniAgent is a Casper-native AI agent for RWA collateral risk. It:

1. Pulls public market evidence (and optional paid x402 RWA evidence)
2. Runs a proposer → critic → policy-gate loop
3. Writes a decision receipt to a native Casper Rust contract
4. Can freeze / unfreeze / set LTV on a collateral vault when the gate approves
5. Exposes a public proof endpoint + verifier so judges need no private keys

## Why Casper

Receipts and enforcement live on Casper Testnet — not a side database. Decision digests, policy gates, and vault mutations are explorer-linkable and replayable.

## x402 evidence rail — native Casper settlement

Premium RWA evidence sits behind a real x402 paywall:

- Facilitator: `https://x402-facilitator.cspr.cloud`
- Network: `casper:casper-test`
- Asset: CEP-18 with `transfer_with_authorization` (make-software WCSPR reference package by default)
- Unpaid `GET /api/x402/rwa-evidence` → HTTP 402 with Casper `accepts[]`
- Paid retry → facilitator `/verify` + `/settle` → CEP-18 transfer on Casper Testnet
- Settlement tx hash is bound into the decision proof receipt

## Collateral vault enforcement

`collateral-vault` maps policy actions to on-chain state:

- `block` → `freeze`
- `approve` → `unfreeze`
- `haircut` → `set_ltv`

Freeze / unfreeze / set_ltv require an approved decision-proof receipt string. The autonomous loop arms vault enforcement after verified readback (`CASPER_VAULT_ENFORCE_ENABLED=true`).

## Guardrails

Live submit is capped and fail-closed:

- `2.5 CSPR` payment cap per deploy
- `4` submissions / UTC day
- `10 CSPR` daily budget
- `50 CSPR` balance reserve
- Chain dedupe + cooldown between live submits
- Vault enforcement is a separate feature flag (canary before arm)

## Public links

| Surface | URL |
|---------|-----|
| Demo | https://omniyield.app |
| Public proof | https://omniagent-production.up.railway.app/api/public/proof |
| Repo | https://github.com/anhquan075/OmniAgent |
| Decision contract | https://testnet.cspr.live/contract/5a82529f9ba05e716933384ddc9862710ba9a0fd3a7347ab1e8c6e60b1a4c861 |
| Demo video | https://www.youtube.com/watch?v=-blqn4a2sf4 |

## Testnet proof table (refresh with live links before finals)

| # | Item | Link |
|---|------|------|
| 1 | Decision contract install | https://testnet.cspr.live/deploy/0444471ab96e840e25d69f525341ee95f014137ebda3e3c0a838eb46b31267f1 |
| 2 | Decision contract | https://testnet.cspr.live/contract/5a82529f9ba05e716933384ddc9862710ba9a0fd3a7347ab1e8c6e60b1a4c861 |
| 3 | Contract package | https://testnet.cspr.live/contract-package/46cf57541f04df822b160dd0e47a8425ec94c310e54a6dda862c46f9b4930bea |
| 4 | Reference demo decision | https://testnet.cspr.live/deploy/ddef65a6d533eecd4c4721a3cb8792c73bb483e2068a03b5a2d86022828a9736 |
| 5 | Latest live decision | https://testnet.cspr.live/deploy/51b01901a2991b43cd586bb684cad9307e2b6ca4e58aa522a5144199c6aca9cc |
| 6 | x402 CEP-18 settle | _paste after live settle_ |
| 7 | Vault install | https://testnet.cspr.live/deploy/21437ac6d7da2965e632d2f931678f6484707474b5b10204be55184076e45946 |
| 8 | Vault freeze | https://testnet.cspr.live/deploy/8d7912626337e21cbb483554bca310f0e00c198c82a990b6bbe7cd6cad6a7591 |
| 9 | Vault unfreeze | https://testnet.cspr.live/deploy/7b24ab0e262f62960edbb6c24aaa1dfef8fdc9aba4eb4237671b2ce5b734c078 |
| 10 | Vault contract | https://testnet.cspr.live/contract/66969eead67ac3cb07e131dc86bf4e6b7e63d2c2a33fb1779f705d79878bb55f |

## Socials

- X / Telegram: _add handles on the BUIDL page before judging_

## Honest status

Native Casper x402 + collateral vault + loop enforcement are on `main` and live
on Railway (vault canary + enforce armed). Paste the live CEP-18 settle into
proof table row 6 and refresh `CASPER_X402_RECEIPT` before claiming paid-evidence
`verified` on the BUIDL page; rows 7–10 already have Testnet explorer links.

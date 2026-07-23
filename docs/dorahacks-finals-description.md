# OmniAgent Finals — DoraHacks BUIDL copy (paste into https://dorahacks.io/buidl/40823)

Use the **Tagline** field for the short line. Paste everything under **Description** into the long-form BUIDL description.

---

## Tagline

```text
AI agents make RWA risk calls nobody can audit. OmniAgent turns every decision into a Casper-verifiable receipt — and enforces it on-chain.
```

---

## Description (copy below this line)

```markdown
# OmniAgent — Casper-native RWA risk agent with on-chain receipts + enforcement

**One-liner:** Should this tokenized collateral stay financeable? OmniAgent answers with a fail-closed AI loop, a Casper decision receipt, and optional vault freeze / LTV enforcement judges can replay without private keys.

## The problem

DeFi credit and RWA financing desks do not need another chatty agent. They need a **replayable trail**:

- what evidence was used
- what the agent proposed and why the critic challenged it
- what the deterministic policy gate allowed
- which Casper transaction sealed the receipt
- whether contract readback matches the digest
- whether collateral state actually changed when risk says `block` / `haircut` / `approve`

Most agent demos stop at a recommendation. OmniAgent stops at **proof**.

## What OmniAgent does

OmniAgent is a **Casper-only** AI agent for RWA collateral risk:

1. **Ingest evidence** — public market sources (US Treasury 10Y as a collateral haircut proxy) plus an optional paid x402 RWA evidence rail
2. **Run an agentic loop** — proposer → critic → policy gate (`approve | haircut | block | hold | warn`)
3. **Write a decision receipt** to a native Casper Rust contract (digest + per-decision dictionary fields)
4. **Enforce on-chain** via a collateral vault (`block→freeze`, `approve→unfreeze`, `haircut→set_ltv`) gated by an approved decision-proof receipt
5. **Publish a public proof console** so judges verify from explorer links + `/api/public/proof` — no signer, no operator token

Live demo: https://omniyield.app  
Repo: https://github.com/anhquan075/OmniAgent  
Video: https://www.youtube.com/watch?v=-blqn4a2sf4

## Why Casper (not a side database)

Receipts and enforcement live on **Casper Testnet**:

- Native Rust contracts (not EVM wrappers)
- Explorer-linkable deploys for install, decisions, vault freeze/unfreeze
- Public readback of proof digests and vault state
- Fail-closed live submit: payment cap, daily count/budget, balance reserve, dedupe, cooldown

## Agentic runtime

- FastAPI backend + Casper MCP tool family (`casper_*`)
- Autonomous loop can poll evidence on an interval and only spend CSPR when a **materially new** decision passes every guardrail
- Dashboard shows AI traces, MCP-compatible tool output, receipt history, and recovery status in one flight deck
- Mutations stay off the public frontend; operator paths are authenticated and rate-limited

## x402 evidence rail — native Casper settlement

Premium RWA evidence is gated by **real Casper x402**, not Base / EVM settlement:

| Field | Value |
|-------|-------|
| Facilitator | `https://x402-facilitator.cspr.cloud` |
| Network | `casper:casper-test` |
| Scheme | `exact` |
| Asset | CEP-18 Wrapped CSPR with `transfer_with_authorization` + `deposit` (package `3d80df21…`) |
| Unpaid | `GET /api/x402/rwa-evidence` → HTTP **402** + Casper `accepts[]` |
| Paid | Facilitator `/verify` + `/settle` → on-chain CEP-18 transfer |
| Binding | Settlement tx hash is bound into the decision proof receipt |

Setup probe: https://omniyield.app/api/x402/setup  
Evidence paywall: https://omniyield.app/api/x402/rwa-evidence

## Collateral vault — decisions that move state

Recording a receipt is not enough for a financing gate. OmniAgent’s `collateral-vault` requires an **approved decision-proof receipt string** before mutating collateral:

- `block` → `freeze`
- `approve` → `unfreeze`
- `haircut` → `set_ltv`

The autonomous loop can arm enforcement after verified readback (`CASPER_VAULT_ENFORCE_ENABLED=true`). Freeze / unfreeze canaries are already live on casper-test (see proof table).

## Guardrails (fail closed)

| Control | Live default |
|---------|--------------|
| Payment per deploy | `2.5 CSPR` cap |
| Submissions / UTC day | `4` |
| Daily budget | `10 CSPR` |
| Balance reserve | `50 CSPR` |
| Live submit | Independent arm + canary before enabling |
| Vault enforce | Separate feature flag (canary before arm) |
| Evidence API down | Loop fails closed — no silent static substitute |

## Judge path (≈5 minutes)

1. Open https://omniyield.app — flight deck + latest proof snapshot
2. Hit https://omniyield.app/api/public/proof — public-safe JSON (no keys)
3. Open a decision deploy on cspr.live from the proof table
4. Confirm unpaid x402 evidence returns **402** with `casper:casper-test`
5. Open vault freeze / unfreeze deploys — enforcement is not theatre

Public proof (Railway): https://omniagent-production.up.railway.app/api/public/proof  
Agent card: https://omniagent-production.up.railway.app/.well-known/casper-agent-card.json

## Public links

| Surface | URL |
|---------|-----|
| Demo | https://omniyield.app |
| Public proof | https://omniagent-production.up.railway.app/api/public/proof |
| Repo | https://github.com/anhquan075/OmniAgent |
| Decision contract | https://testnet.cspr.live/contract/5a82529f9ba05e716933384ddc9862710ba9a0fd3a7347ab1e8c6e60b1a4c861 |
| Vault contract | https://testnet.cspr.live/contract/66969eead67ac3cb07e131dc86bf4e6b7e63d2c2a33fb1779f705d79878bb55f |
| Demo video | https://www.youtube.com/watch?v=-blqn4a2sf4 |

## Testnet proof table

| # | Item | Link |
|---|------|------|
| 1 | Decision contract install | https://testnet.cspr.live/deploy/0444471ab96e840e25d69f525341ee95f014137ebda3e3c0a838eb46b31267f1 |
| 2 | Decision contract | https://testnet.cspr.live/contract/5a82529f9ba05e716933384ddc9862710ba9a0fd3a7347ab1e8c6e60b1a4c861 |
| 3 | Contract package | https://testnet.cspr.live/contract-package/46cf57541f04df822b160dd0e47a8425ec94c310e54a6dda862c46f9b4930bea |
| 4 | Reference demo decision | https://testnet.cspr.live/deploy/ddef65a6d533eecd4c4721a3cb8792c73bb483e2068a03b5a2d86022828a9736 |
| 5 | Latest live decision | https://testnet.cspr.live/deploy/51b01901a2991b43cd586bb684cad9307e2b6ca4e58aa522a5144199c6aca9cc |
| 6 | x402 CEP-18 settle | https://testnet.cspr.live/deploy/93074ccb7f55f7a6eac5f4acdf5de21943c43384a1bfb0f1e194c736eed3bae5 |
| 7 | Vault install | https://testnet.cspr.live/deploy/21437ac6d7da2965e632d2f931678f6484707474b5b10204be55184076e45946 |
| 8 | Vault freeze | https://testnet.cspr.live/deploy/8d7912626337e21cbb483554bca310f0e00c198c82a990b6bbe7cd6cad6a7591 |
| 9 | Vault unfreeze | https://testnet.cspr.live/deploy/7b24ab0e262f62960edbb6c24aaa1dfef8fdc9aba4eb4237671b2ce5b734c078 |
| 10 | Vault contract | https://testnet.cspr.live/contract/66969eead67ac3cb07e131dc86bf4e6b7e63d2c2a33fb1779f705d79878bb55f |

## Built for Casper Agentic Buildathon Finals

OmniAgent maps directly to finals priorities:

- **Working smart contracts** — decision-proof + collateral-vault on casper-test
- **AI / agentic** — proposer/critic/policy gate + autonomous loop with fail-closed arms
- **Technical execution** — live demo, public proof, explorer canaries, payment/budget guardrails
- **Real-world applicability** — RWA collateral financing gate for risk desks
- **x402 ecosystem** — native Casper facilitator settlement path (CEP-18 `transfer_with_authorization`)

## Honest status

- Decision receipts, vault install/freeze/unfreeze, Casper x402 **402 paywall**, and a live CEP-18 settle are on Testnet.
- Proof table row **6**: https://testnet.cspr.live/deploy/93074ccb7f55f7a6eac5f4acdf5de21943c43384a1bfb0f1e194c736eed3bae5
- Set Railway `CASPER_X402_ASSET` to bare Wrapped CSPR (`3d80df21…`) + `CASPER_X402_ASSET_NAME=Wrapped CSPR` so the paywall matches the settled asset; refresh `CASPER_X402_RECEIPT` with the settle tx.

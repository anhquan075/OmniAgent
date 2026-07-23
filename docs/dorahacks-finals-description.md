# OmniAgent Finals — DoraHacks BUIDL copy (paste into https://dorahacks.io/buidl/40823)

Use the **Tagline** field for the short line. Paste everything under **Description** into the long-form BUIDL description.

---

## Tagline

```text
Should this RWA collateral stay financeable? OmniAgent answers with a fail-closed AI loop, a Casper decision receipt, and on-chain vault enforcement.
```

---

## Description (copy below this line)

```markdown
# OmniAgent

**One-liner:** An AI agent that decides RWA collateral risk, writes a Casper-verifiable receipt, and can freeze / unfreeze / set LTV on-chain — judges can replay everything without private keys.

## Judge path (≈5 minutes)

1. Open https://omniyield.app
2. Open https://omniyield.app/api/public/proof (public-safe JSON, no keys)
3. Open the latest decision deploy on cspr.live (proof table row 5)
4. Hit https://omniyield.app/api/x402/rwa-evidence unpaid → HTTP **402** on `casper:casper-test`
5. Open vault freeze / unfreeze / set_ltv deploys (rows 8–9, 12) — enforcement is real state change

Demo: https://omniyield.app  
Repo: https://github.com/anhquan075/OmniAgent  
Video: https://youtu.be/wcVoqJXqPhc

## The problem

DeFi / RWA desks do not need another chatty agent. They need a replayable trail:

- what evidence was used
- what the agent proposed and why the critic challenged it
- what the policy gate allowed
- which Casper transaction sealed the receipt
- whether contract readback matches the digest
- whether collateral state actually changed on `block` / `haircut` / `approve`

Most demos stop at a recommendation. OmniAgent stops at **proof**.

## What it does

Casper-only RWA collateral risk agent:

1. Ingest evidence (public market signals + optional paid x402 RWA evidence)
2. Run agentic loop: proposer → critic → policy gate (`approve | haircut | block | hold | warn`)
3. Write a decision receipt to a native Casper Rust contract
4. Enforce via collateral vault: `block→freeze`, `approve→unfreeze`, `haircut→set_ltv` (gated by an approved receipt)
5. Publish a public proof console so anyone can verify from explorer links

## Why Casper

- Native Rust contracts on Casper Testnet (not a side DB / EVM wrapper)
- Explorer-linkable decision + vault deploys
- Public readback of proof digests and vault state
- Fail-closed live submit (payment cap, daily budget, balance reserve, dedupe, cooldown)

## Native Casper x402

Premium evidence is paywalled with real Casper x402 (not Base/EVM):

| Field | Value |
|------|-------|
| Facilitator | https://x402-facilitator.cspr.cloud |
| Network | `casper:casper-test` |
| Asset | CEP-18 Wrapped CSPR (`3d80df21…`) |
| Unpaid | `GET /api/x402/rwa-evidence` → **402** |
| Paid | facilitator verify + settle → on-chain CEP-18 transfer |
| Binding | settlement tx is bound into the public proof receipt (`bindingStatus=bound`) |

Setup: https://omniyield.app/api/x402/setup

## Differentiator

Agent Casper rebalances a vault. OmniAgent turns every risk call into a **Casper receipt** and can **enforce collateral state** from that receipt — fail-closed, replayable, no private keys required for judges.

## Roadmap

1. Keep high-frequency Testnet canaries through finals
2. Mainnet decision-proof + vault with the same public proof pattern
3. Desk pilot for RWA collateral financing gates
4. Open the proof API so other Casper agents can verify OmniAgent receipts

## Socials / contact

- GitHub: https://github.com/anhquan075/OmniAgent
- Demo: https://omniyield.app
- DoraHacks BUIDL: https://dorahacks.io/buidl/40823

## Testnet proof table

| # | Item | Link |
|---|------|------|
| 1 | Decision contract install | https://testnet.cspr.live/deploy/0444471ab96e840e25d69f525341ee95f014137ebda3e3c0a838eb46b31267f1 |
| 2 | Decision contract | https://testnet.cspr.live/contract/5a82529f9ba05e716933384ddc9862710ba9a0fd3a7347ab1e8c6e60b1a4c861 |
| 3 | Contract package | https://testnet.cspr.live/contract-package/46cf57541f04df822b160dd0e47a8425ec94c310e54a6dda862c46f9b4930bea |
| 4 | Reference demo decision | https://testnet.cspr.live/deploy/ddef65a6d533eecd4c4721a3cb8792c73bb483e2068a03b5a2d86022828a9736 |
| 5 | Latest live decision (`haircut`, 2026-07-23) | https://testnet.cspr.live/deploy/87734909bab1a83890228b59a66c64fd7636ce99eb4beeb4ac5d9c07b990bb22 |
| 6 | x402 CEP-18 settle | https://testnet.cspr.live/deploy/93074ccb7f55f7a6eac5f4acdf5de21943c43384a1bfb0f1e194c736eed3bae5 |
| 7 | Vault install | https://testnet.cspr.live/deploy/21437ac6d7da2965e632d2f931678f6484707474b5b10204be55184076e45946 |
| 8 | Vault freeze (2026-07-23 canary) | https://testnet.cspr.live/deploy/36d1f699ebf201e1c2617a16ee9152a56c567351ba733e2e87b944db7c325176 |
| 9 | Vault unfreeze (2026-07-23 canary) | https://testnet.cspr.live/deploy/39dc155aac0a9be1a23aa424d60d5783d5ff75fb2cb9ab51d4a630a7ea245646 |
| 10 | Vault contract | https://testnet.cspr.live/contract/66969eead67ac3cb07e131dc86bf4e6b7e63d2c2a33fb1779f705d79878bb55f |
| 11 | Prior warn decision (2026-07-23) | https://testnet.cspr.live/deploy/9e6966710a9d2a18ec091e44bd5d90e20fa12ca4d37e123a9be7536b3545e735 |
| 12 | Vault `set_ltv` / haircut enforce (2026-07-23) | https://testnet.cspr.live/deploy/43a8c497166b0d219a9867464b6de2ea66c5a6512f725f51df9bd89341612604 |

## Built for Casper Agentic Buildathon Finals

- **Working smart contracts** — decision-proof + collateral-vault on casper-test
- **AI / agentic** — proposer/critic/policy gate + autonomous loop with fail-closed arms
- **Technical execution** — live demo, public proof, explorer canaries, payment/budget guardrails
- **Real-world applicability** — RWA collateral financing gate for risk desks
- **x402 ecosystem** — native Casper facilitator settlement path (CEP-18 `transfer_with_authorization`)
```

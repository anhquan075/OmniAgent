# OmniAgent Finals — DoraHacks BUIDL copy (paste into https://dorahacks.io/buidl/40823)

Use the **Tagline** field for the short line. Paste everything under **Description** into the long-form BUIDL description.

---

## Tagline

```text
Most finalists attest. OmniAgent enforces — fail-closed AI risk loop → Casper receipt → vault freeze / set_ltv.
```

---

## Description (copy below this line)

```markdown
# OmniAgent

**One-liner:** Most agent demos attest. OmniAgent **enforces**: evidence → fail-closed AI debate → Casper decision receipt → collateral vault `freeze` / `unfreeze` / `set_ltv`. Judges replay it without private keys.

## Attest vs enforce

| Attest-only agents | OmniAgent |
|---|---|
| Prove a claim or score happened | Decide RWA collateral risk, then **change vault state** |
| Stop at a signed message or score | Stop at explorer-linkable **decision + vault** deploys |
| Hard for judges to feel the product | One public page: [https://omniyield.app/try](https://omniyield.app/try) |

## Judge path (≈5 minutes)

1. Open https://omniyield.app/try — live decision, vault entry, **Cheat Lab**, **x402 buy→verify→act**
2. Open https://omniyield.app/api/public/proof (public-safe JSON, no keys) — `status=live_verified`
3. Open the latest decision deploy on cspr.live (proof table row 5)
4. Run paid-act on `/try`: Probe unpaid → HTTP **402**, Verify settle, Enforce from paid
5. Click Cheat Lab attacks → explorer User(100/102/103/104) vault + User(130/131) ACL reverts (rows 13–15, 19, 25–26)
6. Open vault freeze / unfreeze / set_ltv deploys (rows 8–9, 12) — enforcement is real state change

Demo: https://omniyield.app  
Try enforcement: https://omniyield.app/try  
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

Most finalists attest. OmniAgent **enforces collateral** after a fail-closed AI debate. Every risk call becomes a Casper receipt that can drive vault `freeze` / `unfreeze` / `set_ltv` — replayable at `/try` and `/api/public/proof` with no private keys.

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
| 2 | Decision contract v1 | https://testnet.cspr.live/contract/5a82529f9ba05e716933384ddc9862710ba9a0fd3a7347ab1e8c6e60b1a4c861 |
| 3 | Contract package | https://testnet.cspr.live/contract-package/46cf57541f04df822b160dd0e47a8425ec94c310e54a6dda862c46f9b4930bea |
| 4 | Reference demo decision | https://testnet.cspr.live/deploy/ddef65a6d533eecd4c4721a3cb8792c73bb483e2068a03b5a2d86022828a9736 |
| 5 | Latest live decision (`haircut`, live_verified) | https://testnet.cspr.live/deploy/87734909bab1a83890228b59a66c64fd7636ce99eb4beeb4ac5d9c07b990bb22 |
| 6 | x402 CEP-18 settle (bound into receipt) | https://testnet.cspr.live/deploy/93074ccb7f55f7a6eac5f4acdf5de21943c43384a1bfb0f1e194c736eed3bae5 |
| 7 | Vault install | https://testnet.cspr.live/deploy/21437ac6d7da2965e632d2f931678f6484707474b5b10204be55184076e45946 |
| 8 | Vault freeze canary | https://testnet.cspr.live/deploy/36d1f699ebf201e1c2617a16ee9152a56c567351ba733e2e87b944db7c325176 |
| 9 | Vault unfreeze canary | https://testnet.cspr.live/deploy/39dc155aac0a9be1a23aa424d60d5783d5ff75fb2cb9ab51d4a630a7ea245646 |
| 10 | Vault contract | https://testnet.cspr.live/contract/66969eead67ac3cb07e131dc86bf4e6b7e63d2c2a33fb1779f705d79878bb55f |
| 11 | Prior warn decision | https://testnet.cspr.live/deploy/9e6966710a9d2a18ec091e44bd5d90e20fa12ca4d37e123a9be7536b3545e735 |
| 12 | Vault `set_ltv` / haircut enforce | https://testnet.cspr.live/deploy/43a8c497166b0d219a9867464b6de2ea66c5a6512f725f51df9bd89341612604 |
| 13 | Cheat Lab User(100) malformed receipt | https://testnet.cspr.live/deploy/2b7113b0d8a4d916b6c6b0263a500a5823970e920fdef318484a789ccb912d46 |
| 14 | Cheat Lab User(102) unapproved gate | https://testnet.cspr.live/deploy/feb4d8b714dc66d9d19bd1a70cfd71e58f62884b8c3a76771875db92d018dff2 |
| 15 | Cheat Lab User(103) wrong action | https://testnet.cspr.live/deploy/307306b6dd7201466245464d5f3f9d8c7a4563eaac6057fd3a846dcd7322a6c4 |
| 16 | Decision-proof v2 upgrade (`get_decision_receipt`) | https://testnet.cspr.live/deploy/b1ec74679ca73128450d2b9e46ddd99d578d889498afee06eed52f08db1bb3f7 |
| 17 | Verified vault v3 install (pins decision package) | https://testnet.cspr.live/deploy/a1850caeb822fb885cce79bfd0430905021844023d5eaa91fa38abe14fed0638 |
| 18 | Cross-contract `haircut → enforce_verified` succeeds | https://testnet.cspr.live/deploy/599dc698b0d7c52bd3d0ef86f819a47459100cf289b36db5f3fada0fe4354b1b |
| 19 | Cheat Lab User(104): tampered receipt rejected | https://testnet.cspr.live/deploy/ddfdf698ea96e12f439438797d66ff81efdfbb6b5827e0d0849c946dd9109d93 |
| 20 | Active decision-proof v2 contract | https://testnet.cspr.live/contract/9bdd21204d0786256d4cf4ce1325bc16b49558ab1df411d9d3f32c9c34305747 |
| 21 | Active verified vault v3 contract | https://testnet.cspr.live/contract/d286dfb5a15f935ee02c415e478fa08e2b4b2d8c35232002028904ba0f39c5b3 |
| 22 | Decision-proof agent ACL upgrade + rotation | https://testnet.cspr.live/deploy/303561726e466a9b7ed4915d20212199ee1c335745f33dac38c63d21ab2a21a2 |
| 23 | Active decision-proof ACL contract | https://testnet.cspr.live/contract/5270823ca6fb8c4cf5c1f83af53e889ec1f39bbd3532c2088175bb40ca97fc18 |
| 24 | Authorized `record_decision` under ACL | https://testnet.cspr.live/deploy/424467b1ec5dbf6d4d79bdbfac192217ebb36e3f2c1ca448549a5494c8e2b383 |
| 25 | Unauthorized ACL reject User(130) | https://testnet.cspr.live/deploy/1b6c37f5839881af4ee0f6e6f53c1061dc6897b09180904e7e404a3660bfd23b |
| 26 | Mismatched agent field User(131) | https://testnet.cspr.live/deploy/c1daf818ceae217176270ff0d6a16fc16fc7a3280985619c738e518470056cf8 |

Committed artifact: https://github.com/anhquan075/OmniAgent/blob/main/proofs/casper-buildathon-submission-proof.json (`status=live_verified`, includes `cheatReverts` + `paidAct`).

## Built for Casper Agentic Buildathon Finals

- **Working smart contracts** — decision-proof + collateral-vault on casper-test
- **AI / agentic** — proposer/critic/policy gate + autonomous loop with fail-closed arms
- **Technical execution** — live demo, public proof (`live_verified`), explorer canaries, payment/budget guardrails
- **Real-world applicability** — RWA collateral financing gate for risk desks
- **x402 ecosystem** — native Casper facilitator settle + buy→verify→act on `/try`
- **Cross-contract enforcement** — vault reads the authoritative receipt from the latest decision-proof package version
- **Agent ACL** — only the installed OmniAgent account can `record_decision` (User 130/131)
- **Cheat Lab** — six intentional reverts judges can click: vault User(100/102/103/104) + ACL User(130/131)
```

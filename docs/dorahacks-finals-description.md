# OmniAgent Finals — DoraHacks BUIDL copy (paste into https://dorahacks.io/buidl/40823)

Use the **Tagline** field for the short line. Paste everything under **Description** into the long-form BUIDL description.

Last refreshed against production: 2026-07-26 (`status=live_verified`, `authoring=agent_acl`, `vault=cross_contract`, Cheat Lab 6/6).

---

## Tagline

```text
RWA collateral financing gate on Casper — fail-closed AI risk loop, ACL-gated receipts, vault that live-reads the chain.
```

---

## Description (copy below this line)

```markdown
# OmniAgent

**One-liner:** OmniAgent is an RWA collateral financing gate on Casper. Fresh market evidence runs a fail-closed AI risk loop; only the authorized agent can seal the receipt; the vault live-reads that receipt before freeze / LTV changes — replayable without private keys.

## Built for risk desks, not demo theater

| Typical agent demo | OmniAgent for a collateral desk |
|---|---|
| Chatty score or recommendation | Financeability decision: keep, haircut, or freeze collateral |
| Attestation anyone can mint | Receipts only from the installed OmniAgent account |
| Caller-supplied “proof” strings | Vault live-reads decision-proof before state change |
| Hard to audit after the fact | Public proof + explorer canaries a desk can replay |

## Judge path (≈5 minutes)

1. Open https://omniyield.app/try#desk-story — guided Desk Story (402 → haircut → enforce → **on-chain reject cannot-enforce** → ACL cheat)
2. Open https://omniyield.app/api/public/proof — expect `status=live_verified`, `authoring.mode=agent_acl`, `authoring.lastBlocked`, `deskStory` 5/5, `vault.verificationMode=cross_contract`, `cheatReverts` **6/6**
3. Open the latest `haircut` decision and the cross-contract enforce (proof table)
4. On `/try`, run paid evidence: unpaid → HTTP **402** → verify settle → enforce from paid
5. Click the six Cheat Lab attacks — vault and authoring fail-closed with explorer User errors
6. Optional: freeze / unfreeze / set_ltv canaries — collateral state actually changed

Demo: https://omniyield.app  
Desk Story: https://omniyield.app/try#desk-story  
Public proof: https://omniyield.app/api/public/proof  
Repo: https://github.com/anhquan075/OmniAgent  
Video (≤90s desk path): https://youtu.be/wcVoqJXqPhc

## The financing question

Tokenized collateral does not stay financeable forever. When public market evidence moves, a desk needs a clear, replayable answer:

> Should this RWA position remain financeable — at what LTV — or should it freeze?

That answer has to carry more than a model opinion. It needs:

- the evidence that was used
- the proposer / critic debate and policy gate outcome
- a Casper transaction that sealed the receipt
- confirmation that **only the desk’s agent** could write it
- confirmation the vault changed LTV / freeze state from the **on-chain** receipt

OmniAgent is built for that gate.

## What it does

Casper-only RWA collateral risk agent:

1. Ingest evidence (public market signals + optional paid x402 RWA evidence)
2. Run agentic loop: proposer → critic → policy gate (`approve | haircut | block | hold | warn`)
3. Seal a decision receipt on a native Casper Rust contract — ACL-gated to OmniAgent
4. Enforce on the collateral vault: `block→freeze`, `approve→unfreeze`, `haircut→set_ltv` / `enforce_verified`
5. Publish a public proof console so risk, ops, and external reviewers can verify from explorer links

## Controls a desk can show auditors

| Control | On-chain behavior |
|------|-------------------|
| Authoring ACL | Deploy signer must match installed `authorized_agent` → else **User(130)** |
| Receipt identity | `agent_account_hash` must equal the signer → else **User(131)** |
| Cross-contract enforce | Vault live-reads decision-proof by `decision_id`; tampered claim → **User(104)** |
| Receipt integrity | Bad format / blocked gate / wrong action → **User(100/102/103)** |
| Live-submit budget | Payment cap, daily budget, balance reserve, dedupe, cooldown |

All six intentional failure modes are published as Cheat Lab canaries on `/try` — useful for demos and for showing how the gate fail-closes.

## Why Casper

- Native Rust contracts on Casper Testnet (not a side database or EVM wrapper)
- Explorer-linkable decision and vault deploys a desk can file in an audit pack
- Package-stable upgrades (vault pins the decision-proof package, so authoring upgrades do not break enforce)
- Public readback of digests, receipts, vault state, and authorized agent

## Native Casper x402 (paid evidence)

Premium RWA evidence is paywalled with real Casper x402 — not Base / EVM:

| Field | Value |
|------|-------|
| Facilitator | https://x402-facilitator.cspr.cloud |
| Network | `casper:casper-test` |
| Asset | CEP-18 Wrapped CSPR (`3d80df21…`) |
| Unpaid | `GET /api/x402/rwa-evidence` → **402** |
| Paid | facilitator verify + settle → on-chain CEP-18 transfer |
| Binding | settlement tx bound into the public proof receipt (`bindingStatus=bound`) |
| Desk path | buy → verify → act on `/try` (3/3 steps ready) |

Setup: https://omniyield.app/api/x402/setup

## Differentiator

OmniAgent is an **RWA collateral financing gate**, not an attestation toy. Fresh evidence feeds a fail-closed AI risk loop; only the authorized agent can seal the Casper receipt (**including on-chain rejects with critic dissent**); the vault live-reads that receipt before changing financeability — and refuse-enforces blocked gates. Desks and judges replay the Desk Story at `/try#desk-story` without private keys.

## Roadmap (desk-pilot pack)

1. **30d** — Keep Testnet audit pack live (Desk Story, Cheat Lab 6/6, reject/dissent canaries)
2. **60d** — One design-partner dry-run with a collateral desk on `/try`
3. **90d** — Mainnet decision-proof + vault with the same public proof pattern
4. Open the proof API so other Casper agents can verify OmniAgent receipts

Full pack: https://github.com/anhquan075/OmniAgent/blob/main/docs/casper-launch-roadmap.md

Explicit non-claims: no fabricated LOIs or partners.

## Socials / contact

- GitHub: https://github.com/anhquan075/OmniAgent
- Demo: https://omniyield.app
- DoraHacks BUIDL: https://dorahacks.io/buidl/40823

## Testnet proof table (live pins first)

| # | Item | Link |
|---|------|------|
| 1 | Active decision-proof (ACL) | https://testnet.cspr.live/contract/5270823ca6fb8c4cf5c1f83af53e889ec1f39bbd3532c2088175bb40ca97fc18 |
| 2 | Decision package (stable across upgrades) | https://testnet.cspr.live/contract-package/46cf57541f04df822b160dd0e47a8425ec94c310e54a6dda862c46f9b4930bea |
| 3 | Active verified vault v3 | https://testnet.cspr.live/contract/d286dfb5a15f935ee02c415e478fa08e2b4b2d8c35232002028904ba0f39c5b3 |
| 4 | Verified vault package | https://testnet.cspr.live/contract-package/cd2c2dea8b12da453351090bcd003db38718f301c419c2033701147a897f7883 |
| 5 | Latest live decision (`haircut`, live_verified) | https://testnet.cspr.live/deploy/87734909bab1a83890228b59a66c64fd7636ce99eb4beeb4ac5d9c07b990bb22 |
| 6 | x402 CEP-18 settle (bound into receipt) | https://testnet.cspr.live/deploy/93074ccb7f55f7a6eac5f4acdf5de21943c43384a1bfb0f1e194c736eed3bae5 |
| 7 | Cross-contract `haircut → enforce_verified` | https://testnet.cspr.live/deploy/599dc698b0d7c52bd3d0ef86f819a47459100cf289b36db5f3fada0fe4354b1b |
| 8 | Vault freeze canary | https://testnet.cspr.live/deploy/36d1f699ebf201e1c2617a16ee9152a56c567351ba733e2e87b944db7c325176 |
| 9 | Vault unfreeze canary | https://testnet.cspr.live/deploy/39dc155aac0a9be1a23aa424d60d5783d5ff75fb2cb9ab51d4a630a7ea245646 |
| 10 | Vault `set_ltv` / haircut enforce | https://testnet.cspr.live/deploy/43a8c497166b0d219a9867464b6de2ea66c5a6512f725f51df9bd89341612604 |
| 11 | Authorized `record_decision` under ACL | https://testnet.cspr.live/deploy/424467b1ec5dbf6d4d79bdbfac192217ebb36e3f2c1ca448549a5494c8e2b383 |
| 12 | Cheat Lab User(100) malformed receipt | https://testnet.cspr.live/deploy/2b7113b0d8a4d916b6c6b0263a500a5823970e920fdef318484a789ccb912d46 |
| 13 | Cheat Lab User(102) unapproved gate | https://testnet.cspr.live/deploy/feb4d8b714dc66d9d19bd1a70cfd71e58f62884b8c3a76771875db92d018dff2 |
| 14 | Cheat Lab User(103) wrong action | https://testnet.cspr.live/deploy/307306b6dd7201466245464d5f3f9d8c7a4563eaac6057fd3a846dcd7322a6c4 |
| 15 | Cheat Lab User(104) tampered authoritative receipt | https://testnet.cspr.live/deploy/ddfdf698ea96e12f439438797d66ff81efdfbb6b5827e0d0849c946dd9109d93 |
| 16 | Cheat Lab User(130) unauthorized recorder | https://testnet.cspr.live/deploy/1b6c37f5839881af4ee0f6e6f53c1061dc6897b09180904e7e404a3660bfd23b |
| 17 | Cheat Lab User(131) forged agent identity | https://testnet.cspr.live/deploy/c1daf818ceae217176270ff0d6a16fc16fc7a3280985619c738e518470056cf8 |
| 18 | ACL upgrade + authorized-agent rotation | https://testnet.cspr.live/deploy/303561726e466a9b7ed4915d20212199ee1c335745f33dac38c63d21ab2a21a2 |
| 19 | Verified vault v3 install | https://testnet.cspr.live/deploy/a1850caeb822fb885cce79bfd0430905021844023d5eaa91fa38abe14fed0638 |
| 20 | Decision-proof v2 upgrade (`get_decision_receipt`) | https://testnet.cspr.live/deploy/b1ec74679ca73128450d2b9e46ddd99d578d889498afee06eed52f08db1bb3f7 |
| 21 | Original decision contract install | https://testnet.cspr.live/deploy/0444471ab96e840e25d69f525341ee95f014137ebda3e3c0a838eb46b31267f1 |
| 22 | Reference demo decision | https://testnet.cspr.live/deploy/ddef65a6d533eecd4c4721a3cb8792c73bb483e2068a03b5a2d86022828a9736 |

Committed artifact: https://github.com/anhquan075/OmniAgent/blob/main/proofs/casper-buildathon-submission-proof.json  
(`status=live_verified`, `authoring.mode=agent_acl`, `vault.verificationMode=cross_contract`, `cheatReverts` 6/6, `paidAct` 3/3)

## Built for Casper Agentic Buildathon Finals

- **Working smart contracts** — decision-proof (ACL) + verified collateral-vault on casper-test
- **AI / agentic** — proposer/critic/policy gate for collateral financeability
- **Technical execution** — live desk path, public proof (`live_verified`), explorer canaries, budget guardrails
- **Real-world applicability** — RWA collateral financing gate with an auditor-friendly replay trail
- **x402 ecosystem** — native Casper paid evidence + buy→verify→act on `/try`
- **Cross-contract enforcement** — vault live-reads the authoritative receipt before changing LTV / freeze
- **Agent ACL** — only the installed OmniAgent account can seal decisions (User 130/131)
- **Cheat Lab** — six published fail-closed paths: vault User(100/102/103/104) + ACL User(130/131)
```

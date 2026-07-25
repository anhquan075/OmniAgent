# Casper Launch Roadmap — desk-pilot pack

Buyer: **RWA collateral desk / financing committee** that needs a replayable
financeability gate (keep / haircut / freeze) with auditor-friendly explorer
proofs — not another chatty agent.

Public audit pack (no keys):

- https://omniyield.app/try#desk-story
- https://omniyield.app/api/public/proof (`live_verified`, `authoring`, `deskStory`, `cheatReverts`)
- https://omniyield.app/api/public/cheat
- Committed snapshot: `proofs/casper-buildathon-submission-proof.json`

Non-claims: no LOIs, no invented partners, no mainnet yet.

## 30 days — Testnet audit pack (now)

- Keep public proof schema stable; Desk Story + Cheat Lab 6/6 + paid-act 3/3
- On-chain reject/dissent receipts + ACL authoring + cross-contract vault reads
- Demo video: https://youtu.be/wcVoqJXqPhc (desk path + public proof)
- Signer rotation + live-submit runbook: `docs/finals-ops-runbook.md`
- One additional RWA evidence source behind the same source-hash pipeline

## 60 days — Design-partner dry-run

- Run one collateral desk through `/try` Desk Story with their sample position IDs
- Capture feedback on LTV / freeze semantics and audit-pack export
- Promote x402 from configured → verified only after receipt binding checks pass
- Publish a reusable proof-receipt template other Casper agents can verify
- Dashboard compare: tracked proof artifact vs live `/api/public/proof`

## 90 days — Mainnet readiness

- Mainnet checklist: funding, signer policy, alerting, incident rollback
- Deploy decision-proof + verified vault with the same public proof pattern
- Partner-facing docs for DeFi risk desks and RWA issuers
- Multi-provider agent trace capture; deterministic policy gate stays authoritative

## Ecosystem impact

OmniAgent is intentionally narrow: a Casper agent that turns a risky off-chain
financeability call into an ACL-gated receipt a vault can live-read — without
giving judges private keys.

Pattern:

public evidence → proposer/critic/policy gate → Casper receipt (approve **or**
reject) → vault enforce / fail-closed → public proof packet → verifier script

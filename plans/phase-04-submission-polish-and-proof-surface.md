---
phase: 4
title: "Submission Polish and Proof Surface"
status: pending
priority: P2
effort: "0.5 day"
dependencies: [1]
---

# Phase 4: Submission Polish and Proof Surface

## Overview

Make the DoraHacks BUIDL page and README match what the code actually does — and what judges score first. Ship a clickable proof table, simplified tagline, named Guardrails section, and (time permitting) CSPR.click connect. This phase can start in parallel with Phase 2 once Phase 1 has at least one live Casper x402 tx.

## Requirements

- Functional:
  - DoraHacks description updated (tagline + full markdown body)
  - Proof table with ≥8 rows including: contract installs, live decisions, x402 settle, vault freeze/unfreeze (as available)
  - Guardrails section documents caps/canary/dedupe/reserve
  - README "EVM/Solana facilitator" claim removed
- Non-functional:
  - Description stays simple without losing essence (organizer instruction)
  - Socials present (literal judging criterion)
  - Demo video optionally re-recorded after Phase 1–2

## Architecture

No new runtime architecture. Content + light UX:

1. DoraHacks BUIDL page (primary judge surface)
2. README deployment table (secondary)
3. Optional: CSPR.click wallet button on dashboard for deposit into vault

## Related Code Files

- Modify: DoraHacks BUIDL `40823` description (external; paste from draft)
- Modify: `README.md` — deployment table, architecture, remove EVM justification
- Modify (optional): `frontend/src/...` — CSPR.click connect + deposit CTA
- Modify: `proofs/casper-buildathon-submission-proof.json` — refresh hashes/links
- Create/update: demo video on YouTube if re-recorded

## Implementation Steps

1. Paste the rewritten short tagline + full markdown description onto DoraHacks (from prior draft; update x402/vault sections once Phases 1–2 land).
2. Fill proof table TODOs with real cspr.live links (contract, ≥4 recent decisions, x402 settle, vault freeze/unfreeze, agent account).
3. Add Guardrails section (copy from draft; keep numbers in sync with `settings.py`).
4. Fix tagline everywhere: drop "Sovereign Yield Robot Fleet"; use RWA decision-proof / enforceable risk agent wording.
5. Add X/Telegram handles to BUIDL page + README.
6. Keep live loop running; screenshot explorer activity for demo packet.
7. **If Phase 1+2 green by Jul 24 evening:** add CSPR.click connect for vault deposit; else skip.
8. Optionally re-record 2–3 min demo: unpaid 402 → settle on Casper → decision → freeze → public proof verify.

## Success Criteria

- [ ] DoraHacks page has non-empty Testnet links section with ≥8 clickable txs
- [ ] Tagline no longer says "Sovereign Yield Robot Fleet"
- [ ] Guardrails section visible on BUIDL page
- [ ] README matches live Casper x402 reality
- [ ] Socials listed
- [ ] (Stretch) CSPR.click connect works on omniyield.app

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Polishing before Phase 1 lands | High | Judges still see Base x402 | Gate "x402 is native" claims on Phase 1 success; until then keep honest wording |
| Stale tx links | Medium | Trust drop | Refresh table daily until Jul 26 |
| CSPR.click scope creep | Medium | Steal time from Phase 1 | Explicitly optional; cut first |

## Open Questions (for validate)

- Include CSPR.click in mandatory scope or stretch only? (Recommended: stretch)
- Re-record demo video mandatory or only if Phases 1–2 ship?

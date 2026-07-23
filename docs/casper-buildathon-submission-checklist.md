# Casper Buildathon Submission Checklist

This checklist maps the final submission to replayable evidence. Public claims
must stay weaker than the proof packet.

## Public Links

| Item | Status |
|---|---|
| Repository | Current checkout |
| Frontend demo | Set after deployment |
| Backend proof endpoint | `GET /api/public/proof` |
| Proof artifact | `proofs/casper-buildathon-submission-proof.json` |
| Demo video | https://youtu.be/wcVoqJXqPhc |
| Casper contract | See README contract links |

## Proof Commands

```bash
scripts/verify-casper-buildathon-stack.sh
scripts/verify-casper-live-proof.sh --proof-file proofs/casper-buildathon-submission-proof.json
scripts/verify-casper-receipt.sh <decision_id> --use-rpc
```

## Criteria Evidence

| Criterion | Evidence |
|---|---|
| Technical execution | Backend tests, contract build, frontend tests/e2e, verifier script |
| Innovation | Casper-native decision receipt with public proof bundle |
| Agentic AI | Proposer, critic, and policy gate trace source plus hashes |
| Real-world use | RWA collateral/NAV risk receipt scenario |
| UX/design | Dashboard proof panel, receipt history, judge packet |
| Casper Testnet contract | Contract/package links plus live proof packet when verified |
| Long-term vision | Launch roadmap |
| Ecosystem impact | Reusable public proof endpoint and receipt verifier pattern |

## Evidence-Gated Claims

- x402 paid evidence is shipped only when `x402.status == verified` and public
  receipt metadata is bound through `resourceUrl`, `sourceHash`, or
  `requestHash` in the proof artifact.
- LLM-backed trace is shipped only when role `traceSource == llm`.
- Live Casper proof is shipped only when the proof artifact status is
  `live_verified` and readback is verified.
- Dry-run proof remains useful for code quality and UX, but it is not a live
  on-chain claim.

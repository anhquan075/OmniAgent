# OmniAgent Casper Docs

This docs folder is Casper-only. It covers the buildathon runtime, proof model,
dashboard, and submission flow for the Casper Agentic Buildathon Finals.

## Core Docs

- [Architecture](ARCHITECTURE.md)
- [Railway Deployment](railway-deployment.md)
- [Finals ops runbook](finals-ops-runbook.md) — live pins, ACL, verified vault, Cheat Lab 6/6
- [Problem and Approach](problem-and-approach.md)
- [Demo Script](casper-agentic-demo-script.md)
- [Buildathon Submission Checklist](casper-buildathon-submission-checklist.md)
- [Launch Roadmap](casper-launch-roadmap.md)
- Demo video: https://youtu.be/wcVoqJXqPhc
- DoraHacks finals paste: [dorahacks-finals-description.md](dorahacks-finals-description.md)

## Judge surfaces

| Surface | URL |
|---------|-----|
| Proof console | https://omniyield.app |
| Try enforcement (Cheat Lab + paid-act) | https://omniyield.app/try |
| Backend API host | https://api.omniyield.app |
| Public proof JSON | https://api.omniyield.app/api/public/proof |
| Cheat catalog | https://api.omniyield.app/api/public/cheat |
| x402 unpaid probe | https://api.omniyield.app/api/x402/rwa-evidence |
| Agent card | https://omniyield.app/.well-known/casper-agent-card.json |

The console origin proxies `/api/*` and `/.well-known/*` to the backend, so the
`omniyield.app` equivalents of these paths resolve to the same responses.

Expect `status=live_verified`, `authoring.mode=agent_acl`,
`vault.verificationMode=cross_contract`, `cheatReverts.readyCount=6`,
`decisionLifecycle.status=live`, and a `trustSummary` with non-zero
`verifiedReadbackRate` and `policyBlockedRate`.

## Contract docs

- [Decision-proof (ACL + receipts)](../contracts/casper-decision-proof/README.md)
- [Collateral vault (`enforce_verified`)](../contracts/collateral-vault/README.md)

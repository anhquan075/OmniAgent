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
| Public proof JSON | https://omniyield.app/api/public/proof |
| Cheat catalog | https://omniyield.app/api/public/cheat |
| x402 unpaid probe | https://omniyield.app/api/x402/rwa-evidence |

Expect `status=live_verified`, `authoring.mode=agent_acl`,
`vault.verificationMode=cross_contract`, and `cheatReverts.readyCount=6`.

## Contract docs

- [Decision-proof (ACL + receipts)](../contracts/casper-decision-proof/README.md)
- [Collateral vault (`enforce_verified`)](../contracts/collateral-vault/README.md)

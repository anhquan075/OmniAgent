# OmniAgent docs

Guides for the Casper-only OmniAgent demo: how it works, how to deploy it, and how judges can verify it without private keys.

## Start here

| Doc | What it’s for |
|-----|----------------|
| [Architecture](ARCHITECTURE.md) | System pieces and data flow |
| [Problem and approach](problem-and-approach.md) | Why this product exists |
| [Demo script](casper-agentic-demo-script.md) | Spoken walkthrough |
| [Judge reproduction](judge-reproduction.md) | Step-by-step verify path |
| [Finals ops runbook](finals-ops-runbook.md) | Live pins, ACL, vault, Cheat Lab |
| [Railway deployment](railway-deployment.md) | How the public apps are hosted |
| [Submission checklist](casper-buildathon-submission-checklist.md) | DoraHacks box-checking |
| [Launch roadmap](casper-launch-roadmap.md) | What comes after the finals |
| [DoraHacks paste](dorahacks-finals-description.md) | Long-form BUIDL copy |

Demo video: [youtu.be/wcVoqJXqPhc](https://youtu.be/wcVoqJXqPhc)

## Live links judges can open

| Surface | URL |
|---------|-----|
| Proof console | https://omniyield.app |
| Try / Cheat Lab | https://omniyield.app/try |
| API host | https://api.omniyield.app |
| Public proof JSON | https://api.omniyield.app/api/public/proof |
| Cheat catalog | https://api.omniyield.app/api/public/cheat |
| Unpaid x402 probe | https://api.omniyield.app/api/x402/rwa-evidence |
| Agent card | https://omniyield.app/.well-known/casper-agent-card.json |

The console proxies `/api/*` and `/.well-known/*` to the backend, so the same paths also work on `omniyield.app`.

**Healthy proof looks like:** `status=live_verified`, `authoring.mode=agent_acl`, `vault.verificationMode=cross_contract`, Cheat Lab 6/6, `decisionLifecycle.status=live`, and non-zero trust rates for verified readback and policy blocks.

## Contract docs

- [Decision-proof (receipts + ACL)](../contracts/casper-decision-proof/README.md)
- [Collateral vault (`enforce_verified`)](../contracts/collateral-vault/README.md)

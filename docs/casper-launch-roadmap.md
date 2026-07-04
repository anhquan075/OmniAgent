# Casper Launch Roadmap

## 30 Days

- Keep the public proof packet schema stable and versioned.
- Record a short demo that replays the exact proof artifact and public endpoint.
- Add one more RWA evidence source behind the same source-hash pipeline.
- Document a signer rotation and live-submit runbook.

## 60 Days

- Add a real paid evidence provider when an x402 receipt source is available.
- Expand public verifier checks for account, contract package, decision id, and
  receipt dictionary values.
- Publish a reusable proof-receipt template for other Casper agents.
- Add dashboard comparison for latest proof artifact vs public endpoint.

## 90 Days

- Prepare a mainnet-readiness checklist with funding, signer policy, alerting,
  and incident rollback.
- Package the proof endpoint and receipt verifier as a Casper ecosystem example.
- Add partner-facing docs for DeFi risk desks and RWA issuers.
- Extend agent trace capture to multiple model providers while keeping the
  deterministic policy gate authoritative.

## Ecosystem Impact

OmniAgent is intentionally narrow: it shows how a Casper agent can make a risky
off-chain decision auditable without giving judges or integrators private keys.
The reusable piece is the pattern:

public evidence -> deterministic proof digest -> Casper receipt -> public proof
packet -> verifier script.

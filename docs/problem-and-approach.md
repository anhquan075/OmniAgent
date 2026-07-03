# Problem And Approach

OmniAgent is a Casper-only AI agent that produces verifiable decision receipts
for RWA collateral financing gates. The judge story is one sentence: **"Should
this tokenized collateral remain financeable?"**

The buyer persona is a DeFi risk desk or tokenized collateral committee.
OmniAgent verifies the decision process and receipt — not the ultimate
real-world truth of the asset.

Agentic blockchain demos often fail at the proof boundary: the agent may explain a decision, but judges cannot quickly tell whether the runtime is fail-closed, whether the decision payload is deterministic, or whether the on-chain receipt can be read back.

OmniAgent focuses on that boundary for Casper. The product is a compact Casper decision agent that:

- Reads public RWA evidence (US Treasury yield as collateral haircut proxy).
- Normalizes evidence into deterministic source hashes and risk factors.
- Runs proposer, critic, and policy-gate guardrails before live submit.
- Stores per-decision receipt fields in a Casper dictionary for replayable proof.
- Fails closed when Casper account, signer, contract, or readback proof is missing.
- Records dry-run evidence locally without live submission.
- Surfaces evidence summary, receipt history, and verify-receipt in the cockpit.
- Keeps one runtime and one MCP tool family so the submission is easy to audit.

The result is intentionally narrow: Casper Testnet decision proof first, no legacy chain adapters.

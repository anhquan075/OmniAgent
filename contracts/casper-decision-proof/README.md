# Casper Decision Proof Contract

Minimal Casper Testnet contract for the buildathon live proof.

The contract stores the latest OmniAgent decision receipt fields:

- `decision_id`
- `action`
- `proof_digest`
- `risk_score`
- `policy_gate`
- `agent_account_hash`
- `guardrail_hash`

It also writes a pipe-delimited receipt string into the `decision_receipts`
dictionary keyed by `decision_id`, while preserving `latest_proof_digest` for
the live readback verifier.

Build:

```bash
rustup toolchain install nightly-2025-03-01
rustup target add wasm32v1-none --toolchain nightly-2025-03-01
cargo +nightly-2025-03-01 build --manifest-path contracts/casper-decision-proof/Cargo.toml --release --target wasm32v1-none
```

Install the generated Wasm once with `casper-client put-deploy --session-path`, then set `CASPER_DECISION_CONTRACT_HASH` and `CASPER_DECISION_CONTRACT_PACKAGE_HASH` for backend live decision calls.

The live Testnet contract for this submission is:

- Install deploy hash: `0444471ab96e840e25d69f525341ee95f014137ebda3e3c0a838eb46b31267f1`
- Contract hash: `5a82529f9ba05e716933384ddc9862710ba9a0fd3a7347ab1e8c6e60b1a4c861`
- Package hash: `46cf57541f04df822b160dd0e47a8425ec94c310e54a6dda862c46f9b4930bea`

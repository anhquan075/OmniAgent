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

## Agent ACL (authoring)

`record_decision` is still a public entry point, but it fail-closes unless:

1. The deploy signer equals the install-time `authorized_agent` → otherwise
   `ApiError::User(130)`.
2. The `agent_account_hash` argument equals that same signer (bare 64-hex) →
   otherwise `ApiError::User(131)`.

Reads stay public: `latest_proof_digest`, `latest_decision_receipt`,
`get_decision_receipt`, and `get_authorized_agent`.

Fresh install and the first ACL upgrade both require session arg
`agent_account_hash`. Re-running the Wasm after the account marker
`omniagent_decision_proof_acl_seeded` exists upgrades the package without
re-seeding (receipts + authorized agent preserved).

```bash
./scripts/build-casper-contracts.sh
AGENT_ACCOUNT_HASH=<bare-64-hex> \
  CASPER_SECRET_KEY_PATH=~/.casper/secret_key.pem \
  ./scripts/upgrade-decision-proof-acl.sh
```

Then pin the new contract hash:

```bash
CASPER_DECISION_CONTRACT_HASH=<new-version-hash>
CASPER_DECISION_AUTHORIZED_AGENT_HASH=<bare-64-hex>
CASPER_DECISION_ACL_ENABLED=true
```

The package hash is stable across versions. Collateral vault stores the
decision-proof **package** hash, so `enforce_verified` keeps working without a
vault redeploy.

## Build

```bash
./scripts/build-casper-contracts.sh
# artifact: contracts/casper-decision-proof/wasm/casper-decision-proof.wasm
```

Install / upgrade with `casper-client put-deploy --session-path`, then set
`CASPER_DECISION_CONTRACT_HASH` and `CASPER_DECISION_CONTRACT_PACKAGE_HASH` for
backend live decision calls.

The live Testnet package for this submission is:

- Package hash: `46cf57541f04df822b160dd0e47a8425ec94c310e54a6dda862c46f9b4930bea`
- Active ACL contract: `5270823ca6fb8c4cf5c1f83af53e889ec1f39bbd3532c2088175bb40ca97fc18`
- Authorized agent: `account-hash-9b62ecfba326c1ab3f249b0f39f457d8fcb0bc7f68f59b7357d4667339ee1f04`
  (derive via `casper-client account-address --public-key $CASPER_ACCOUNT_PUBLIC_KEY`,
  **not** blake2b of the public-key hex alone)

Confirm live pins with `/api/public/proof` → `contractHash`, `authoring.mode=agent_acl`.

## Blocked / dissent receipts

`record_decision` accepts `policy_gate` in `{approved, blocked, hold, warn}` under the
same Agent ACL.

- **approved** — updates `latest_*` (live_verified surface)
- **blocked / hold / warn** — writes `latest_blocked_*` without clobbering approved latest
- Optional session args `proposer_verdict`, `critic_verdict`, `dissent_digest` are stored
  for multi-agent audit readback
- Vault still refuse-enforces non-approved receipts (`User(102)`)

Read: `latest_blocked_receipt`. Public proof exposes `authoring.lastBlocked` + `deskStory`.

## Cheat Lab (ACL reverts)

Published explorer canaries on `/try`:

| Scenario | User | Deploy |
|----------|------|--------|
| Unauthorized recorder | 130 | [`1b6c37f5…`](https://testnet.cspr.live/deploy/1b6c37f5839881af4ee0f6e6f53c1061dc6897b09180904e7e404a3660bfd23b) |
| Forged agent identity | 131 | [`c1daf818…`](https://testnet.cspr.live/deploy/c1daf818ceae217176270ff0d6a16fc16fc7a3280985619c738e518470056cf8) |

These are canary-only in the backend: the production signer *is* the authorized
agent, so live mode cannot reproduce User(130) against itself.

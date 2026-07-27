# Casper decision-proof contract

Small native Casper Rust contract that stores OmniAgent decision receipts on Testnet.

Each receipt keeps:

- `decision_id`, `action`, `proof_digest`, `risk_score`, `policy_gate`
- `agent_account_hash`, `guardrail_hash`

It also writes a pipe-delimited string into the `decision_receipts` dictionary (keyed by `decision_id`) and keeps `latest_proof_digest` for live readback.

## Who can write (agent ACL)

`record_decision` is a public entry point, but it **fail-closes** unless:

1. The deploy signer is the install-time `authorized_agent` → else `ApiError::User(130)`
2. The `agent_account_hash` argument matches that signer (bare 64-hex) → else `ApiError::User(131)`

Anyone can still **read**: `latest_proof_digest`, `latest_decision_receipt`, `get_decision_receipt`, `get_authorized_agent`.

Fresh install and the first ACL upgrade need session arg `agent_account_hash`. After the account marker `omniagent_decision_proof_acl_seeded` exists, re-running the Wasm upgrades the package without wiping receipts or the authorized agent.

```bash
./scripts/build-casper-contracts.sh
AGENT_ACCOUNT_HASH=<bare-64-hex> \
  CASPER_SECRET_KEY_PATH=~/.casper/secret_key.pem \
  ./scripts/upgrade-decision-proof-acl.sh
```

Then pin:

```bash
CASPER_DECISION_CONTRACT_HASH=<new-version-hash>
CASPER_DECISION_AUTHORIZED_AGENT_HASH=<bare-64-hex>
CASPER_DECISION_ACL_ENABLED=true
```

The **package** hash stays stable across versions. The collateral vault stores that package hash, so `enforce_verified` keeps working without a vault redeploy.

## Build

```bash
./scripts/build-casper-contracts.sh
# → contracts/casper-decision-proof/wasm/casper-decision-proof.wasm
```

Install/upgrade with `casper-client put-deploy --session-path`, then set `CASPER_DECISION_CONTRACT_HASH` and `CASPER_DECISION_CONTRACT_PACKAGE_HASH` for the backend.

### Live Testnet pins (this submission)

| Item | Value |
|------|--------|
| Package | `46cf57541f04df822b160dd0e47a8425ec94c310e54a6dda862c46f9b4930bea` |
| Active ACL contract | `5270823ca6fb8c4cf5c1f83af53e889ec1f39bbd3532c2088175bb40ca97fc18` |
| Authorized agent | `account-hash-9b62ecfba326c1ab3f249b0f39f457d8fcb0bc7f68f59b7357d4667339ee1f04` |

Derive the agent hash with `casper-client account-address --public-key $CASPER_ACCOUNT_PUBLIC_KEY` — **not** blake2b of the public-key hex alone.

Confirm via `/api/public/proof` → `contractHash`, `authoring.mode=agent_acl`.

## Approved vs blocked receipts

`policy_gate` may be `approved`, `blocked`, `hold`, or `warn` (same ACL rules).

| Gate | Effect |
|------|--------|
| `approved` | Updates `latest_*` (the live_verified surface) |
| `blocked` / `hold` / `warn` | Writes `latest_blocked_*` without overwriting the approved latest |

Optional session args `proposer_verdict`, `critic_verdict`, and `dissent_digest` support multi-agent audit readback. The vault still refuses to enforce non-approved receipts (`User(102)`).

Read blocked state with `latest_blocked_receipt`. Public proof surfaces it as `authoring.lastBlocked` and in `deskStory`.

## Cheat Lab (ACL reverts)

Published canaries on `/try`:

| Scenario | User | Deploy |
|----------|------|--------|
| Unauthorized recorder | 130 | [1b6c37f5…](https://testnet.cspr.live/deploy/1b6c37f5839881af4ee0f6e6f53c1061dc6897b09180904e7e404a3660bfd23b) |
| Forged agent identity | 131 | [c1daf818…](https://testnet.cspr.live/deploy/c1daf818ceae217176270ff0d6a16fc16fc7a3280985619c738e518470056cf8) |

These are canary-only in the backend: production OmniAgent *is* the authorized signer, so live mode cannot reproduce User(130) against itself.

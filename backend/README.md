# OmniAgent Casper Backend

FastAPI backend for the Casper-only OmniAgent runtime.

## Run

```bash
uv sync --group dev
OMNIAGENT_SKIP_ENV_FILE=true \
CASPER_LIVE_SUBMIT_ENABLED=false \
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend can point to it with:

```bash
VITE_API_URL=http://localhost:8000 pnpm -C ../frontend run dev
```

## Public surfaces

| Endpoint | Purpose |
|----------|---------|
| `GET /api/public/proof` | Judge packet (`live_verified`, ACL + vault + Cheat Lab + paid-act, lifecycle, trust, risk verdict) |
| `GET /api/public/cheat` | Six intentional revert scenarios with explorer canaries |
| `POST /api/public/cheat/{id}` | Replay a canary (or live vault attack when armed) |
| `GET /api/x402/rwa-evidence` | Unpaid → HTTP 402 on `casper:casper-test` |
| `GET /.well-known/casper-agent-card.json` | Discoverable agent card with the same trust aggregate |

The deployed host is `https://api.omniyield.app`; `API_TRUSTED_HOSTS` and
`ALLOWED_FRONTEND_ORIGINS` must list it (plus `omniyield.app`) or requests are
rejected with `Host is not trusted`.

Cheat Lab canaries ship in `data/cheat-lab-canaries.json` (and the Railway
`/data` volume). ACL scenarios (`unauthorized_recorder` / `forged_agent_identity`)
are canary-only — OmniAgent is the authorized signer and cannot reproduce
User(130) against itself.

## Decision-proof ACL

Set these for production authoring:

```bash
CASPER_DECISION_CONTRACT_HASH=<active-acl-version>
CASPER_DECISION_CONTRACT_PACKAGE_HASH=<stable-package>
CASPER_DECISION_AUTHORIZED_AGENT_HASH=<bare-64-hex>
CASPER_DECISION_ACL_ENABLED=true
```

Account hashes must be derived with Casper's preimage
(`ascii(ed25519|secp256k1) || 0x00 || raw_key`), not a raw blake2b of the
public-key hex. See `app/services/casper/account.py`.

## Verified vault

```bash
CASPER_VAULT_VERIFIED_CONTRACT_HASH=<v3-hash>
CASPER_VAULT_VERIFIED_PACKAGE_HASH=<v3-package>
CASPER_VAULT_VERIFIED_ENABLED=true
CASPER_VAULT_ENFORCE_ENABLED=true
```

`enforce_verified` live-reads the decision-proof package; public proof reports
`vault.verificationMode=cross_contract`.

## Trust metrics

`app/services/casper/trust.py` aggregates over **decisions**, not ledger rows.
The ledger writes a submit row and a later readback row for the same
`decisionId`, so the service groups by `decisionId`, OR-joins readback
verification across that decision's rows, and reads the whole ledger window
(`CASPER_LEDGER_MAX_EVENTS`, default `2000`) instead of the newest N rows.
Duplicate-intent retries no longer append a row at all
(`app/services/casper/contract.py`), so a retry burst cannot dilute the sample.

An on-chain blocked decision can be pinned with
`CASPER_DECISION_BLOCKED_DECISION_ID` / `CASPER_DECISION_BLOCKED_CANARY_TX_HASH`
and is merged only when that `decisionId` is missing from the ledger — useful
when the blocked receipt was authored from a workstation SQLite the deployed
service never saw. Seeded samples stay auditable via `sampleSources` and
`components.seededBlockedDecisions`.

## LLM traces

Set `CASPER_LLM_TRACE_ENABLED=true` with a valid `OPENROUTER_API_KEY` to publish
public-safe role traces. Each of `proposer`, `critic`, and `policy_gate` exposes
`action`, `reasonCodes`, `reasonSummary`, and prompt/output hashes — never raw
prompts or completions.

## Live Gates

Live submit prerequisite validation stays blocked unless all of these are true:

- `CASPER_ACCOUNT_PUBLIC_KEY` is configured.
- `CASPER_SECRET_KEY_PATH` points to signer material outside git.
- `CASPER_DECISION_CONTRACT_HASH` is configured.
- `CASPER_DECISION_CONTRACT_PACKAGE_HASH` is configured.
- `CASPER_CLIENT_PATH` resolves to `casper-client`.
- `CASPER_DECISION_LEDGER_PATH` is on a mounted persistent volume for live mode.
- Casper responds to a state-root probe from `casper-client`.
- The account balance is readable and remains above `CASPER_MIN_BALANCE_CSPR` after the offered payment.
- `CASPER_LIVE_SUBMIT_ENABLED=true`.
- `API_OPERATOR_TOKEN` authenticates dashboard/MCP mutation controls.
- The command includes `--i-understand-this-submits-casper-testnet`.

When those gates pass, the backend still requires chain/local semantic dedupe,
cooldown, daily count/payment budgets, bounded receipt arguments, and an atomic
SQLite intent reservation before invoking `casper-client put-deploy`. The
default payment cap is 2.5 CSPR and recurring live submit requires the separate
`CASPER_AGENT_LOOP_LIVE_SUBMIT_ENABLED=true` arm. The experimental `put-txn`
builder is blocked from live submit until its pricing can be budgeted
independently. Status remains pending until readback confirms the deploy and
receipt.

## Verify

```bash
uv run pytest -q
uv run python -m compileall -q app tests scripts
```

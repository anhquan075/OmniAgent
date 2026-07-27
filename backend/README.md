# OmniAgent backend

FastAPI service that runs the Casper agent loop, public proof APIs, MCP tools, and (when armed) live Testnet submits.

## Run locally (safe mode)

```bash
uv sync --group dev
OMNIAGENT_SKIP_ENV_FILE=true \
CASPER_LIVE_SUBMIT_ENABLED=false \
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Point the frontend at it:

```bash
VITE_API_URL=http://localhost:8000 pnpm -C ../frontend run dev
```

## Public endpoints

| Endpoint | What a visitor gets |
|----------|---------------------|
| `GET /api/public/proof` | Judge packet: live status, ACL, vault, Cheat Lab, lifecycle, trust, risk verdict |
| `GET /api/public/cheat` | Six intentional revert scenarios + explorer canaries |
| `POST /api/public/cheat/{id}` | Replay a canary (live vault attack only when armed) |
| `GET /api/x402/rwa-evidence` | Unpaid → HTTP **402** on Casper Testnet |
| `GET /.well-known/casper-agent-card.json` | Discoverable agent card (includes trust summary) |

Production host: **https://api.omniyield.app**

Set `API_TRUSTED_HOSTS` and `ALLOWED_FRONTEND_ORIGINS` to include `api.omniyield.app` and `omniyield.app`, or the API answers with `Host is not trusted`.

Cheat Lab canaries live in `data/cheat-lab-canaries.json` (and the Railway `/data` volume). ACL cases (`unauthorized_recorder`, `forged_agent_identity`) are **canary-only** — the live signer *is* the authorized agent, so it cannot reproduce User(130) against itself.

## Decision-proof ACL

Only the installed agent may author receipts:

```bash
CASPER_DECISION_CONTRACT_HASH=<active-acl-version>
CASPER_DECISION_CONTRACT_PACKAGE_HASH=<stable-package>
CASPER_DECISION_AUTHORIZED_AGENT_HASH=<bare-64-hex>
CASPER_DECISION_ACL_ENABLED=true
```

Account hashes must use Casper’s preimage (`ascii(ed25519|secp256k1) || 0x00 || raw_key`) — not a raw blake2b of the public-key hex. See `app/services/casper/account.py`.

## Verified vault

```bash
CASPER_VAULT_VERIFIED_CONTRACT_HASH=<v3-hash>
CASPER_VAULT_VERIFIED_PACKAGE_HASH=<v3-package>
CASPER_VAULT_VERIFIED_ENABLED=true
CASPER_VAULT_ENFORCE_ENABLED=true
```

`enforce_verified` live-reads the decision-proof package. Public proof should report `vault.verificationMode=cross_contract`.

## Trust metrics

`app/services/casper/trust.py` counts **decisions**, not every ledger row.

Why that matters: each decision usually gets a submit row and a later readback row. The aggregator:

- groups by `decisionId` (one vote per decision)
- OR-joins readback across that decision’s rows
- reads the full ledger window (`CASPER_LEDGER_MAX_EVENTS`, default **2000**)

Duplicate-intent retries are no longer appended (`app/services/casper/contract.py`), so a retry storm cannot wash out real history.

You can pin an on-chain blocked canary with `CASPER_DECISION_BLOCKED_DECISION_ID` / `CASPER_DECISION_BLOCKED_CANARY_TX_HASH`. It only seeds when that id is missing from the ledger, and it stays labeled via `sampleSources` / `seededBlockedDecisions`.

## LLM traces

```bash
CASPER_LLM_TRACE_ENABLED=true
OPENROUTER_API_KEY=...
```

Publishes public-safe role traces for `proposer`, `critic`, and `policy_gate`: action, reason codes, summary, and prompt/output hashes — never raw prompts or completions.

## Live submit gates

Live submit stays blocked until all of these are true:

- Funded account public key + signer path outside git  
- Decision contract + package hashes  
- `casper-client` on PATH (or `CASPER_CLIENT_PATH`)  
- Persistent ledger path on a volume (live mode)  
- Casper answers a state-root probe  
- Balance stays above `CASPER_MIN_BALANCE_CSPR` after the offered payment  
- `CASPER_LIVE_SUBMIT_ENABLED=true`  
- Valid `API_OPERATOR_TOKEN`  
- One-shot scripts include `--i-understand-this-submits-casper-testnet`

Even then: semantic dedupe, cooldown, daily count/budget caps, bounded receipt args, and an atomic SQLite intent reservation run before `put-deploy`. Default payment cap is **2.5 CSPR**. The recurring loop needs a separate `CASPER_AGENT_LOOP_LIVE_SUBMIT_ENABLED=true`. Status stays pending until readback confirms the deploy and receipt.

## Tests

```bash
uv run pytest -q
uv run python -m compileall -q app tests scripts
```

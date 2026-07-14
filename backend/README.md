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

When those gates pass, the backend still requires chain/local semantic dedupe, cooldown, daily count/payment budgets, bounded receipt arguments, and an atomic SQLite intent reservation before invoking `casper-client put-deploy`. The default payment cap is 2.5 CSPR and recurring live submit requires the separate `CASPER_AGENT_LOOP_LIVE_SUBMIT_ENABLED=true` arm. The experimental `put-txn` builder is blocked from live submit until its pricing can be budgeted independently. Status remains pending until readback confirms the deploy and receipt.

## Verify

```bash
uv run pytest -q
uv run python -m compileall -q app tests scripts
```

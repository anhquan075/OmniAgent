# OmniAgent Casper Backend

FastAPI backend for the Casper-only OmniAgent runtime.

## Run

```bash
rtk uv sync --group dev
OMNIAGENT_SKIP_ENV_FILE=true \
CASPER_LIVE_SUBMIT_ENABLED=false \
rtk uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend can point to it with:

```bash
VITE_API_URL=http://localhost:8000 rtk pnpm -C ../frontend run dev
```

## Live Gates

Live submit prerequisite validation stays blocked unless all of these are true:

- `CASPER_ACCOUNT_PUBLIC_KEY` is configured.
- `CASPER_SECRET_KEY_PATH` points to signer material outside git.
- `CASPER_DECISION_CONTRACT_HASH` is configured.
- `CASPER_DECISION_CONTRACT_PACKAGE_HASH` is configured.
- `CASPER_CLIENT_PATH` resolves to `casper-client`.
- Casper responds to a state-root probe from `casper-client`.
- `CASPER_LIVE_SUBMIT_ENABLED=true`.
- The command includes `--i-understand-this-submits-casper-testnet`.

When those gates pass, the backend invokes `casper-client put-deploy` against the deployed `record_decision` entrypoint, captures the deploy hash, and appends a submitted decision receipt to the Casper ledger. Status remains pending until `casper_get_deploy_status` confirms the deploy and `casper_record_readback` queries `latest_proof_digest` from Casper state. `casper_get_decision_receipt` and `casper_verify_decision_receipt` replay a specific decision id from local proof evidence.

## Verify

```bash
rtk uv run pytest -q
rtk uv run python -m compileall -q app tests scripts
```

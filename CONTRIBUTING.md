# Contributing

Keep changes focused on the Casper proof runtime, dashboard, contract, or verifier flow.

Before submitting a pull request, run the checks that match your change:

```bash
uv sync --project backend --group dev
uv run --project backend ruff check .
uv run --project backend pytest
pnpm -C frontend install --frozen-lockfile
pnpm -C frontend test -- --run
pnpm -C frontend build
scripts/check-secrets.sh
```

For contract changes:

```bash
cargo +nightly-2025-03-01 check --manifest-path contracts/casper-decision-proof/Cargo.toml
cargo +nightly-2025-03-01 build --manifest-path contracts/casper-decision-proof/Cargo.toml --release --target wasm32v1-none
```

Never commit private keys, Railway secrets, funded signer files, or real API tokens.

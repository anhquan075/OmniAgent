#!/bin/bash
# Start frontend for Playwright e2e with Casper env vars.
set -e
cd "$(dirname "$0")/.."
export VITE_PLAYWRIGHT=true
export VITE_API_URL=http://127.0.0.1:8020
export VITE_DEFAULT_NETWORK=casper-test
exec pnpm exec vite --host 127.0.0.1 --port 5174

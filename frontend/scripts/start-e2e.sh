#!/bin/bash
# Start frontend for Playwright e2e with BSC env vars.
set -e
cd "$(dirname "$0")/.."
export VITE_PLAYWRIGHT=true
export VITE_API_URL=http://localhost:8000
export VITE_DEFAULT_NETWORK=bsc
exec pnpm run dev

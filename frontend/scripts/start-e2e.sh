#!/bin/bash
# Start frontend for Playwright e2e tests with test env vars
set -e
cd "$(dirname "$0")"
export VITE_PLAYWRIGHT=true
export VITE_API_URL=http://localhost:3001
export VITE_DEFAULT_NETWORK=testnet
exec pnpm run dev

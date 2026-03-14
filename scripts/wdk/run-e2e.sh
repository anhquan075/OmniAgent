#!/bin/bash

# TetherProof-WDK E2E Runner
# Uses direct node execution for hardhat to bypass broken symlinks in node_modules

echo "🚀 Starting TetherProof-WDK E2E Test Suite..."

# 1. Start Hardhat Node in background if not already running
if ! lsof -i:8545 > /dev/null; then
  echo "[1/3] Starting Hardhat Node..."
  node node_modules/hardhat/internal/cli/bootstrap.js node > hardhat-node.log 2>&1 &
  NODE_PID=$!
  sleep 5
else
  echo "[1/3] Hardhat Node already running."
fi

# 2. Compile (Just in case)
echo "[2/3] Compiling Contracts..."
node node_modules/hardhat/internal/cli/bootstrap.js compile

# 3. Run the E2E Flow
# We need to tell E2ETestFlow.mjs how to run hardhat
export HARDHAT_BIN="node node_modules/hardhat/internal/cli/bootstrap.js"

echo "[3/3] Running E2E Flow Script..."
node scripts/wdk/E2ETestFlow.mjs

# Cleanup
if [ ! -z "$NODE_PID" ]; then
  echo "Cleaning up Hardhat Node (PID: $NODE_PID)..."
  kill $NODE_PID
fi

echo "Done."

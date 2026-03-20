#!/bin/bash

# MCP Tool Test Script
# Tests MCP tools with real blockchain data

MCP_CMD="cd /Users/quannguyen/Documents/coding-stuff/omnisdk/backend && pnpm mcp:stdio"

echo "=========================================="
echo "Testing OmniWDK MCP Server"
echo "=========================================="
echo ""

# Test Sepolia Tools
echo "=== Sepolia Tools ==="
echo ""

# 1. sepolia_createWallet
echo "1. Testing sepolia_createWallet..."
RESULT=$(echo '{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"sepolia_createWallet","arguments":{}}}' | timeout 10 $MCP_CMD 2>/dev/null | grep -o '{"result".*}' | head -1)
echo "$RESULT" | jq -r '.result.content[0].text' 2>/dev/null | jq -r '.address // .walletAddress // . // "ERROR"' | head -3
echo ""

# 2. sepolia_getBalance
echo "2. Testing sepolia_getBalance..."
RESULT=$(echo '{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"sepolia_getBalance","arguments":{}}}' | timeout 10 $MCP_CMD 2>/dev/null | grep -o '{"result".*}' | head -1)
echo "$RESULT" | jq -r '.result.content[0].text' 2>/dev/null | head -20
echo ""

echo "=========================================="
echo "Basic tool tests complete!"
echo "=========================================="

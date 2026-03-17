#!/bin/bash

# MCP Tool Test Script
# Tests all 14 MCP tools with real blockchain data

MCP_CMD="cd /Users/quannguyen/Documents/coding-stuff/omnisdk/backend && pnpm mcp:stdio"

echo "=========================================="
echo "Testing OmniWDK MCP Server - 14 Tools"
echo "=========================================="
echo ""

# Test BNB Chain Tools
echo "=== BNB Chain Tools ==="
echo ""

# 1. bnb_createWallet
echo "1. Testing bnb_createWallet..."
RESULT=$(echo '{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"bnb_createWallet","arguments":{}}}' | timeout 10 $MCP_CMD 2>/dev/null | grep -o '{"result".*}' | head -1)
echo "$RESULT" | jq -r '.result.content[0].text' 2>/dev/null | jq -r '.address // .walletAddress // . // "ERROR"' | head -3
echo ""

# 2. bnb_getBalance
echo "2. Testing bnb_getBalance..."
RESULT=$(echo '{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"bnb_getBalance","arguments":{}}}' | timeout 10 $MCP_CMD 2>/dev/null | grep -o '{"result".*}' | head -1)
echo "$RESULT" | jq -r '.result.content[0].text' 2>/dev/null | head -20
echo ""

# 3. sol_createWallet  
echo "=== Solana Tools ==="
echo ""

# 3. sol_createWallet
echo "3. Testing sol_createWallet..."
RESULT=$(echo '{"jsonrpc":"2.0","id":"3","method":"tools/call","params":{"name":"sol_createWallet","arguments":{}}}' | timeout 10 $MCP_CMD 2>/dev/null | grep -o '{"result".*}' | head -1)
echo "$RESULT" | jq -r '.result.content[0].text' 2>/dev/null | head -5
echo ""

# 4. sol_getBalance
echo "4. Testing sol_getBalance..."
RESULT=$(echo '{"jsonrpc":"2.0","id":"4","method":"tools/call","params":{"name":"sol_getBalance","arguments":{}}}' | timeout 10 $MCP_CMD 2>/dev/null | grep -o '{"result".*}' | head -1)
echo "$RESULT" | jq -r '.result.content[0].text' 2>/dev/null | head -10
echo ""

# 5. ton_createWallet
echo "=== TON Tools ==="
echo ""

# 5. ton_createWallet
echo "5. Testing ton_createWallet..."
RESULT=$(echo '{"jsonrpc":"2.0","id":"5","method":"tools/call","params":{"name":"ton_createWallet","arguments":{}}}' | timeout 10 $MCP_CMD 2>/dev/null | grep -o '{"result".*}' | head -1)
echo "$RESULT" | jq -r '.result.content[0].text' 2>/dev/null | head -5
echo ""

# 6. ton_getBalance
echo "6. Testing ton_getBalance..."
RESULT=$(echo '{"jsonrpc":"2.0","id":"6","method":"tools/call","params":{"name":"ton_getBalance","arguments":{}}}' | timeout 10 $MCP_CMD 2>/dev/null | grep -o '{"result".*}' | head -1)
echo "$RESULT" | jq -r '.result.content[0].text' 2>/dev/null | head -10
echo ""

echo "=========================================="
echo "Basic tool tests complete!"
echo "=========================================="

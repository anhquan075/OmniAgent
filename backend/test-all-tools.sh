#!/bin/bash
# Comprehensive MCP Tool Test Script
# Tests ALL 54+ tools with minimal parameters

MCP_URL="http://localhost:3001/api/mcp"
RESULTS_FILE="/tmp/mcp-test-results.txt"
> "$RESULTS_FILE"

echo "=========================================="
echo "Testing ALL MCP Tools"
echo "=========================================="
echo ""

test_tool() {
  local name=$1
  local params=$2
  local id=$3
  
  echo -n "Testing $name... "
  
  local payload="{\"jsonrpc\":\"2.0\",\"id\":$id,\"method\":\"tools/call\",\"params\":{\"name\":\"$name\",\"arguments\":$params}}"
  
  local result=$(curl -s -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    --max-time 30 2>&1)
  
  if echo "$result" | grep -q '"error"'; then
    local error=$(echo "$result" | jq -r '.error.message // .error // "unknown error"' 2>/dev/null || echo "parse error")
    echo "ERROR: $error"
    echo "$name: $error" >> "$RESULTS_FILE"
    return 1
  elif echo "$result" | grep -q '"result"'; then
    echo "OK"
    echo "$name: OK" >> "$RESULTS_FILE"
    return 0
  else
    echo "NO RESPONSE"
    echo "$name: No response" >> "$RESULTS_FILE"
    return 1
  fi
}

# ==================== X402 AGENT ECONOMY (4) ====================
echo "=== X402 Agent Economy ==="
test_tool "x402_get_balance" "{}" 100
test_tool "x402_list_services" "{}" 101
test_tool "x402_fleet_status" "{}" 102
test_tool "x402_pay_subagent" '{"to_agent":"test","amount":"0.01","intelligence_type":"market_data"}' 103
echo ""

# ==================== WDK VAULT & ENGINE (10) ====================
echo "=== WDK Vault & Engine ==="
test_tool "wdk_vault_getBalance" "{}" 200
test_tool "wdk_vault_getState" "{}" 201
test_tool "wdk_vault_deposit" '{"amount":"1000000"}' 202
test_tool "wdk_vault_withdraw" '{"amount":"100000"}' 203
test_tool "wdk_engine_getRiskMetrics" "{}" 204
test_tool "wdk_engine_getCycleState" "{}" 205
test_tool "wdk_engine_executeCycle" "{}" 206
test_tool "wdk_aave_getPosition" "{}" 207
test_tool "wdk_aave_supply" '{"amount":"1000000"}' 208
test_tool "wdk_aave_withdraw" '{"amount":"100000"}' 209
echo ""

# ==================== WDK PROTOCOL (9) ====================
echo "=== WDK Protocol Tools ==="
test_tool "wdk_lending_getPosition" "{}" 300
test_tool "wdk_lending_supply" '{"token":"usdt","amount":"1000000"}' 301
test_tool "wdk_lending_withdraw" '{"token":"usdt","amount":"100000"}' 302
test_tool "wdk_lending_borrow" '{"token":"usdt","amount":"500000"}' 303
test_tool "wdk_lending_repay" '{"token":"usdt","amount":"100000"}' 304
test_tool "wdk_bridge_usdt0" '{"targetChain":"arbitrum","amount":"1000000"}' 305
test_tool "wdk_bridge_usdt0_status" '{"bridgeId":"test123"}' 306
test_tool "wdk_swap_tokens" '{"tokenIn":"usdt","tokenOut":"weth","amount":"1000000"}' 307
test_tool "wdk_mint_test_token" '{"amount":"1000000000"}' 308
echo ""

# ==================== ERC-4337 SMART ACCOUNTS (12) ====================
echo "=== ERC-4337 Smart Accounts ==="
test_tool "erc4337_createAccount" "{}" 400
test_tool "erc4337_getAccountAddress" '{"walletIndex":0}' 401
test_tool "erc4337_isValidAccount" '{"address":"0x0000000000000000000000000000000000000000"}' 402
test_tool "erc4337_getBalance" '{"walletIndex":0}' 403
test_tool "erc4337_getDeposit" '{"walletIndex":0}' 404
test_tool "erc4337_addDeposit" '{"walletIndex":0,"amount":"1000000000000000"}' 405
test_tool "erc4337_withdrawNative" '{"walletIndex":0,"amount":"1000000000000000","to":"0x0000000000000000000000000000000000000000"}' 406
test_tool "erc4337_execute" '{"walletIndex":0,"to":"0x0000000000000000000000000000000000000000","value":"0"}' 407
test_tool "erc4337_executeBatch" '{"walletIndex":0,"operations":[{"to":"0x0000000000000000000000000000000000000000","value":"0"}]}' 408
test_tool "erc4337_setTokenApproval" '{"walletIndex":0,"token":"0xd077a400968890eacc75cdc901f0356c943e4fdb","spender":"0x0000000000000000000000000000000000000000","amount":"1000000"}' 409
test_tool "erc4337_isTokenApproved" '{"walletIndex":0,"token":"0xd077a400968890eacc75cdc901f0356c943e4fdb","spender":"0x0000000000000000000000000000000000000000"}' 410
test_tool "erc4337_withdrawToken" '{"walletIndex":0,"token":"0xd077a400968890eacc75cdc901f0356c943e4fdb","amount":"1000000","to":"0x0000000000000000000000000000000000000000"}' 411
echo ""

# ==================== SEPOLIA (9) ====================
echo "=== Sepolia Wallet Tools ==="
test_tool "sepolia_createWallet" "{}" 500
test_tool "sepolia_getBalance" "{}" 501
test_tool "sepolia_transfer" '{"to":"0x0000000000000000000000000000000000000000","amount":"0.001"}' 502
test_tool "sepolia_swap" '{"tokenIn":"usdt","tokenOut":"weth","amount":"1000000"}' 503
test_tool "sepolia_supplyAave" '{"amount":"1000000"}' 504
test_tool "sepolia_withdrawAave" '{"amount":"100000"}' 505
test_tool "sepolia_bridgeLayerZero" '{"targetChain":"arbitrum","amount":"1000000"}' 506
test_tool "sepolia_getCreditScore" "{}" 507
test_tool "sepolia_getNavInfo" "{}" 508
echo ""

# ==================== ARBITRUM (4) ====================
echo "=== Arbitrum Wallet Tools ==="
test_tool "arbitrum_createWallet" "{}" 600
test_tool "arbitrum_getBalance" "{}" 601
test_tool "arbitrum_transfer" '{"to":"0x0000000000000000000000000000000000000000","amount":"0.001"}' 602
test_tool "arbitrum_getGasPrice" "{}" 603
echo ""

# ==================== POLYGON (4) ====================
echo "=== Polygon Wallet Tools ==="
test_tool "polygon_createWallet" "{}" 700
test_tool "polygon_getBalance" "{}" 701
test_tool "polygon_transfer" '{"to":"0x0000000000000000000000000000000000000000","amount":"0.001"}' 702
test_tool "polygon_getGasPrice" "{}" 703
echo ""

# ==================== GNOSIS (4) ====================
echo "=== Gnosis Wallet Tools ==="
test_tool "gnosis_createWallet" "{}" 800
test_tool "gnosis_getBalance" "{}" 801
test_tool "gnosis_transfer" '{"to":"0x0000000000000000000000000000000000000000","amount":"0.001"}' 802
test_tool "gnosis_getGasPrice" "{}" 803
echo ""

# ==================== MARKET TOOLS (5) ====================
echo "=== Market Tools ==="
test_tool "market_get_price_matrix" '{"chains":["sepolia"],"tokens":["usdt"]}' 900
test_tool "market_get_best_opportunity" '{"riskLevel":"medium"}' 901
test_tool "market_calculate_profit" '{"tokenIn":"usdt","tokenOut":"weth","amount":"1000000"}' 902
test_tool "market_start_scanner" '{"intervalMs":30000}' 903
test_tool "market_stop_scanner" "{}" 904
echo ""

# ==================== SUMMARY ====================
echo "=========================================="
echo "TEST SUMMARY"
echo "=========================================="

PASSED=$(grep -c ": OK" "$RESULTS_FILE" || echo "0")
FAILED=$(grep -c ": ERROR" "$RESULTS_FILE" || echo "0")
WARNINGS=$(grep -c ": No response" "$RESULTS_FILE" || echo "0")
TOTAL=$((PASSED + FAILED + WARNINGS))

echo "Total: $TOTAL | Passed: $PASSED | Failed: $FAILED | Warnings: $WARNINGS"
echo ""
echo "Failed tests:"
grep ": ERROR" "$RESULTS_FILE" || echo "None"
echo ""
echo "Warning tests:"
grep ": No response" "$RESULTS_FILE" || echo "None"

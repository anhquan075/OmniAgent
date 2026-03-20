# OmniAgent MCP Tools Reference

Complete schema reference for all 64 MCP tools. Format: `tool_name(param: "value")`.

---

## X402 Agent Economy (4 tools)

### `x402_pay_subagent(serviceUrl, amount, serviceType)`
Pay a sub-agent via x402 HTTP 402 payment flow.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `serviceUrl` | ✅ | string | Service endpoint URL | `"https://api.example.com/api/risk-analysis"` |
| `amount` | ✅ | string | Amount in USDT units (6 decimals) | `"0.1"` for 0.1 USDT |
| `serviceType` | ✅ | string | Service ID | `"risk_analysis"`, `"arbitrage_scan"`, `"yield_optimization"`, `"data_fetch"`, `"smart_contract_review"` |

**Output:** `{ txHash, amount, serviceType }`

---

### `x402_get_balance(address?)`
Get USDT balance for x402 payments.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `address` | ❌ | string | Wallet address to check (defaults to agent wallet) | `"0xd8dA6BF..."` |

**Output:** `{ balance, balanceFormatted }`

---

### `x402_list_services()`
List available sub-agent services for hire via x402.
| Params | None |
|--------|------|
**Output:** `{ services: [{ id, name, description, priceUsdt, endpoint }] }`

---

### `x402_fleet_status()`
Get robot fleet operational state and earnings.
| Params | None |
|--------|------|
**Output:** `{ enabled, robots, fleetTotalEarned, recentEvents }`

---

## WDK Vault & Engine (13 tools)

### `wdk_mint_test_token(amount?, recipient?)`
Mint test USDT tokens (local hardhat only).
| Param | Required | Type | Description | Default | Example |
|-------|----------|------|-------------|---------|---------|
| `amount` | ❌ | string | Amount in USDT units (6 decimals) | `"1000"` | `"1000"`, `"100.5"`, `"5000"` |
| `recipient` | ❌ | string | Recipient address (defaults to agent wallet) | agent wallet | `"0xd8dA6BF..."` |

**Output:** `{ txHash, amount, recipient }`

---

### `wdk_vault_deposit(amount?)`
Deposit USDT into WDK Vault for vault shares.
| Param | Required | Type | Description | Default | Example |
|-------|----------|------|-------------|---------|---------|
| `amount` | ❌ | string | Amount in USDT units (6 decimals) | `"100"` | `"100"`, `"0.001"`, `"1000.5"` |

**Output:** `{ txHash, amount }`

---

### `wdk_vault_withdraw(amount?, receiver?)`
Withdraw USDT from WDK Vault by burning shares.
| Param | Required | Type | Description | Default | Example |
|-------|----------|------|-------------|---------|---------|
| `amount` | ❌ | string | Amount in USDT units (6 decimals) | `"10"` | `"10"`, `"0.5"`, `"100.25"` |
| `receiver` | ❌ | string | Recipient address (defaults to agent wallet) | agent wallet | `"0xd8dA6BF..."` |

**Output:** `{ txHash, amount }`

---

### `wdk_vault_getBalance(account?)`
Get vault share balance for an account.
| Param | Required | Type | Description | Default | Example |
|-------|----------|------|-------------|---------|---------|
| `account` | ❌ | string | Account address (defaults to agent address) | agent address | `"0xd8dA6BF..."` |

**Output:** `{ balance }`

---

### `wdk_vault_getState()`
Get vault buffer status, utilization, and operational parameters.
| Params | None |
|--------|------|
**Output:** `{ currentBuffer, targetBuffer, utilizationBps }`

---

### `wdk_engine_executeCycle()`
Execute a yield optimization cycle (high risk).
| Params | None |
|--------|------|
**Output:** `{ txHash, cycleNumber }`

---

### `wdk_engine_getCycleState()`
Get current cycle state and decision preview.
| Params | None |
|--------|------|
**Output:** `{ nextState, price, timestamp, cycleNumber }`

---

### `wdk_engine_getRiskMetrics()`
Get risk metrics including health factor.
| Params | None |
|--------|------|
**Output:** `{ healthFactor }`

---

### `wdk_aave_supply(amount)`
Supply USDT to Aave lending pool as collateral.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `amount` | ✅ | string | Amount in USDT units (6 decimals) | `"100"`, `"0.001"`, `"1000.5"` |

**Output:** `{ txHash, action }`

---

### `wdk_aave_withdraw(amount)`
Withdraw USDT from Aave lending pool.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `amount` | ✅ | string | Amount in USDT units (6 decimals) | `"10"`, `"0.5"`, `"100.25"` |

**Output:** `{ txHash, amountWithdrawn }`

---

### `wdk_aave_getPosition(user?)`
Get Aave lending position (supplied, borrowed, health factor).
| Param | Required | Type | Description | Default | Example |
|-------|----------|------|-------------|---------|---------|
| `user` | ❌ | string | Account address (defaults to agent address) | agent address | `"0xd8dA6BF..."` |

**Output:** `{ supplied, borrowed, healthFactor }`

---

### `wdk_bridge_usdt0(targetChain, recipient, amount)`
Bridge USDT to another blockchain.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `targetChain` | ✅ | string | Target blockchain name | `"ethereum"`, `"arbitrum"`, `"polygon"` |
| `recipient` | ✅ | string | Recipient address on destination chain | `"0xd8dA6BF..."` |
| `amount` | ✅ | string | Amount in USDT units (6 decimals) | `"100"`, `"0.001"`, `"1000.5"` |

**Output:** `{ txHash, destinationChainId, estimatedReceive }`

---

### `wdk_bridge_usdt0_status(destinationChainId, amount?)`
Get bridge quote without executing.
| Param | Required | Type | Description | Default | Example |
|-------|----------|------|-------------|---------|---------|
| `destinationChainId` | ✅ | string | Destination chain ID | — | `"1"`, `"42161"`, `"137"` |
| `amount` | ❌ | string | Amount in USDT units (6 decimals) | `"100"` | `"100"`, `"0.001"`, `"1000.5"` |

**Output:** `{ nativeFee, bridgeFee }`

---

## WDK Protocol Tools (9 tools)

### `wdk_lending_supply(token, amount)`
Supply USDT or XAUT to Aave V3 on Sepolia.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `token` | ✅ | string | Token symbol or address | `"USDT"`, `"XAUT"`, `"0xd077a4..."` |
| `amount` | ✅ | string | Amount in token units | `"100"`, `"1000.5"` |

**Output:** `{ txHash, amount, approveHash }`

---

### `wdk_lending_withdraw(token, amount)`
Withdraw from Aave V3 on Sepolia.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `token` | ✅ | string | Token symbol or address | `"USDT"`, `"XAUT"`, `"0xd077a4..."` |
| `amount` | ✅ | string | Amount in token units | `"50"`, `"500.75"` |

**Output:** `{ txHash, amount }`

---

### `wdk_lending_borrow(token, amount)`
Borrow from Aave V3 on Sepolia (requires collateral).
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `token` | ✅ | string | Token to borrow | `"USDT"`, `"XAUT"`, `"0xd077a4..."` |
| `amount` | ✅ | string | Amount in token units | `"50"`, `"200.5"` |

**Output:** `{ txHash, amount }`

---

### `wdk_lending_repay(token, amount)`
Repay Aave V3 debt on Sepolia.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `token` | ✅ | string | Token to repay | `"USDT"`, `"XAUT"`, `"0xd077a4..."` |
| `amount` | ✅ | string | Amount in token units | `"10"`, `"100.25"` |

**Output:** `{ txHash, amount }`

---

### `wdk_lending_getPosition()`
Get Aave V3 position on Sepolia (collateral, debt, health factor).
| Params | None |
|--------|------|
**Output:** `{ network, walletAddress, totalCollateral, totalDebt, availableBorrows, healthFactor, ltv, liquidationThreshold }`

---

### `wdk_swap_tokens(tokenIn, tokenOut, amount)`
Swap tokens via WDK Velora DEX on Sepolia.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `tokenIn` | ✅ | string | Input token symbol or address | `"USDT"`, `"XAUT"`, `"WETH"`, `"0xd077a4..."` |
| `tokenOut` | ✅ | string | Output token symbol or address | `"XAUT"`, `"USDT"`, `"WETH"`, `"0x810249..."` |
| `amount` | ✅ | string | Amount of input token in token units | `"50"`, `"250.75"` |

**Output:** `{ txHash, tokenInAmount, tokenOutAmount }`

---

### `wdk_autonomous_cycle()`
Execute one complete autonomous yield decision cycle (high risk).
| Params | None |
|--------|------|
**Output:** `{ action, reason, success, state: { lastAction, consecutiveFailures, healthFactor, marketCondition } }`

---

### `wdk_autonomous_status()`
Get autonomous agent state (no tx execution).
| Params | None |
|--------|------|
**Output:** `{ lastAction, lastActionTime, consecutiveFailures, totalSupplied, totalWithdrawn, healthFactor, marketCondition, strategy }`

---

## ERC-4337 Smart Accounts (12 tools)

### `erc4337_createAccount(owner?)`
Create new ERC-4337 smart account (gasless txs).
| Param | Required | Type | Description | Default |
|-------|----------|------|-------------|---------|
| `owner` | ❌ | string | EOA owner address | signer.getAddress() |

**Output:** `{ account, txHash }`

---

### `erc4337_getAccountAddress(owner?)`
Get predicted smart account address before creation.
| Param | Required | Type | Description | Default |
|-------|----------|------|-------------|---------|
| `owner` | ❌ | string | Owner EOA address | signer.getAddress() |

**Output:** `{ predictedAddress }`

---

### `erc4337_isValidAccount(account?)`
Check if address is a deployed smart account.
| Param | Required | Type | Description | Default |
|-------|----------|------|-------------|---------|
| `account` | ❌ | string | Account address to check | default WDK account |

**Output:** `{ isValid, account }`

---

### `erc4337_execute(account?, dest?, value?, data?)`
Execute single transaction from smart account.
| Param | Required | Type | Description | Default |
|-------|----------|------|-------------|---------|
| `account` | ❌ | string | Smart account address | — |
| `dest` | ❌ | string | Destination address | ZeroAddress |
| `value` | ❌ | string | ETH value in wei | `"0"` |
| `data` | ❌ | string | Calldata hex | `"0x"` |

**Output:** `{ txHash }`

---

### `erc4337_executeBatch(account?, dests?, values?, datas?)`
Execute multiple transactions atomically.
| Param | Required | Type | Description |
|-------|----------|------|-------------|
| `account` | ❌ | string | Smart account address |
| `dests` | ❌ | string[] | Array of destination addresses |
| `values` | ❌ | string[] | Array of ETH values in wei |
| `datas` | ❌ | string[] | Array of calldata hex strings |

**Output:** `{ txHash }`

---

### `erc4337_addDeposit(account?, amount?)`
Add ETH deposit to EntryPoint for gas payments.
| Param | Required | Type | Description | Default |
|-------|----------|------|-------------|---------|
| `account` | ❌ | string | Smart account address | — |
| `amount` | ❌ | string | ETH in wei | — |

**Output:** `{ txHash, deposit }`

---

### `erc4337_getBalance(account?)`
Get ETH balance of smart account.
| Param | Required | Type | Description | Default |
|-------|----------|------|-------------|---------|
| `account` | ❌ | string | Smart account address | default WDK account |

**Output:** `{ balance, account }`

---

### `erc4337_getDeposit(account?)`
Get EntryPoint deposit balance for gas.
| Param | Required | Type | Description | Default |
|-------|----------|------|-------------|---------|
| `account` | ❌ | string | Smart account address | default WDK account |

**Output:** `{ deposit, account }`

---

### `erc4337_withdrawToken(account?, token?, to?, amount?)`
Withdraw ERC-20 tokens from smart account.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `account` | ❌ | string | Smart account address | `"0xd8dA6BF..."` |
| `token` | ❌ | string | ERC-20 token contract address | `"0xdAC17F..."` (USDT) |
| `to` | ❌ | string | Recipient address | `"0x742d35..."` |
| `amount` | ❌ | string | Amount in token's smallest unit | `"1000000"` (1 USDT, 6 dec) |

**Output:** `{ txHash }`

---

### `erc4337_withdrawNative(account?, to?, amount?)`
Withdraw ETH from smart account.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `account` | ❌ | string | Smart account address | `"0xd8dA6BF..."` |
| `to` | ❌ | string | Recipient address | `"0x742d35..."` |
| `amount` | ❌ | string | ETH in wei | `"1000000000000000"` (0.001 ETH) |

**Output:** `{ txHash }`

---

### `erc4337_setTokenApproval(token?, approved?, rate?)`
Set token approval for paymaster sponsorship.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `token` | ❌ | string | ERC-20 token address | `"0xdAC17F..."` (USDT) |
| `approved` | ❌ | boolean | Enable/disable | `true` |
| `rate` | ❌ | string | USD per token (8 decimals) | `"100000000"` (1.00 USD/token) |

**Output:** `{ txHash }`

---

### `erc4337_isTokenApproved(token)`
Check paymaster token approval status.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `token` | ❌ | string | ERC-20 token address | `"0xdAC17F..."` (USDT) |

**Output:** `{ isApproved }`

---

## Sepolia (9 tools)

### `sepolia_createWallet(walletIndex?)`
Create/retrieve Sepolia wallet from WDK seed.
| Param | Required | Type | Description | Default | Example |
|-------|----------|------|-------------|---------|---------|
| `walletIndex` | ❌ | number | Wallet derivation index | `0` | `0`, `1`, `2` |

**Output:** `{ address, network }`

---

### `sepolia_getBalance(address?, tokenAddress?)`
Get ETH and USDT balance for any Sepolia address.
| Param | Required | Type | Description | Default |
|-------|----------|------|-------------|---------|
| `address` | ❌ | string | Sepolia address | main wallet |
| `tokenAddress` | ❌ | string | Token contract address | USDT token |

**Output:** `{ nativeBalance, nativeBalanceWei, tokenBalance, tokenBalanceWei, symbol }`

---

### `sepolia_transfer(to, amount, tokenAddress?, tokenDecimals?)`
Transfer ETH or ERC-20 tokens on Sepolia.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `to` | ✅ | string | Recipient address | `"0xd8dA6BF..."` |
| `amount` | ✅ | string | Amount in token units | `"0.01"` (ETH) or `"100"` (USDT) |
| `tokenAddress` | ❌ | string | Token contract address | `"0xd077a4..."` (USDT) |
| `tokenDecimals` | ❌ | number | Token decimals | `18` (ETH), `6` (USDT) |

**Output:** `{ txHash, blockNumber, gasUsed, status }`

---

### `sepolia_swap(amountIn, tokenIn, tokenOut, slippageBps?)`
Swap tokens on Uniswap V3.
| Param | Required | Type | Description | Default | Example |
|-------|----------|------|-------------|---------|---------|
| `amountIn` | ✅ | string | Input amount in token units | — | `"100"` |
| `tokenIn` | ✅ | string | Input token address | — | `"0xd077a4..."` (USDT) |
| `tokenOut` | ✅ | string | Output token address | — | `"0x0000..."` (ETH) |
| `slippageBps` | ❌ | number | Max slippage in bps (50=0.5%) | `50` | `100` |

**Output:** `{ txHash, amountOut, priceImpact }`

---

### `sepolia_supplyAave(amount)`
Supply USDT to Aave V3 on Sepolia.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `amount` | ✅ | string | Amount in USDT units | `"100"` |

**Output:** `{ txHash, aTokenBalance }`

---

### `sepolia_withdrawAave(amount)`
Withdraw USDT from Aave V3 on Sepolia.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `amount` | ✅ | string | Amount in USDT units | `"50"` |

**Output:** `{ txHash, amountWithdrawn }`

---

### `sepolia_bridgeLayerZero(amount, dstEid, recipientAddress?)`
Bridge USDT via LayerZero V2.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `amount` | ✅ | string | Amount in USDT units | `"50"` |
| `dstEid` | ✅ | number | Destination chain LZ Endpoint ID | `42161` (Arbitrum), `10` (Optimism), `1` (Mainnet) |
| `recipientAddress` | ❌ | string | Recipient on destination chain | `"0xd8dA6BF..."` |

**Output:** `{ txHash, dstEid, estimatedDestinationReceive }`

---

### `sepolia_getNavInfo(vaultAddress?)`
Get vault NAV per share and baseline.
| Param | Required | Type | Description | Default |
|-------|----------|------|-------------|---------|
| `vaultAddress` | ❌ | string | Vault address | WDK_VAULT_ADDRESS |

**Output:** `{ navPerShare, totalAssets, totalSupply, baseline }`

---

### `sepolia_getCreditScore(agentId?)`
Get agent credit score and risk limits.
| Param | Required | Type | Description | Default |
|-------|----------|------|-------------|---------|
| `agentId` | ❌ | string | Agent identifier | main wallet |

**Output:** `{ score, riskLevel, limits, stats }`

---

### `sepolia_getTransactionHistory(address?, limit?, offset?)`
Get recent transaction history.
| Param | Required | Type | Description | Default |
|-------|----------|------|-------------|---------|
| `address` | ❌ | string | Sepolia address | main wallet |
| `limit` | ❌ | number | Max transactions (max 50) | `10` |
| `offset` | ❌ | number | Skip count for pagination | `0` |

**Output:** `{ transactions, total, address, note }`

---

## Multi-Chain Wallets (12 tools)

### Arbitrum Sepolia (4 tools)

#### `arbitrum_createWallet(walletIndex?)`
| Param | Required | Type | Default | Example |
|-------|----------|------|---------|---------|
| `walletIndex` | ❌ | number | `0` | `0`, `1`, `2` |

**Output:** `{ address, network }`

#### `arbitrum_getBalance(address?)`
| Param | Required | Type | Default |
|-------|----------|------|---------|
| `address` | ❌ | string | main wallet |

**Output:** `{ nativeBalance, nativeBalanceWei }`

#### `arbitrum_transfer(to, amount)`
| Param | Required | Type | Example |
|-------|----------|------|---------|
| `to` | ✅ | string | `"0xd8dA6BF..."` |
| `amount` | ✅ | string | `"0.001"`, `"0.01"`, `"0.1"` |

**Output:** `{ txHash, status }`

#### `arbitrum_getGasPrice()`
**Output:** `{ gasPrice, gasPriceGwei }`

---

### Polygon Amoy (4 tools)

#### `polygon_createWallet(walletIndex?)`
| Param | Required | Type | Default | Example |
|-------|----------|------|---------|---------|
| `walletIndex` | ❌ | number | `0` | `0`, `1`, `2` |

**Output:** `{ address, network }`

#### `polygon_getBalance(address?)`
| Param | Required | Type | Default |
|-------|----------|------|---------|
| `address` | ❌ | string | main wallet |

**Output:** `{ nativeBalance, nativeBalanceWei }`

#### `polygon_transfer(to, amount)`
| Param | Required | Type | Example |
|-------|----------|------|---------|
| `to` | ✅ | string | `"0xd8dA6BF..."` |
| `amount` | ✅ | string | `"0.001"`, `"0.01"`, `"0.1"` |

**Output:** `{ txHash, status }`

#### `polygon_getGasPrice()`
**Output:** `{ gasPrice, gasPriceGwei }`

---

### Gnosis Chiado (4 tools)

#### `gnosis_createWallet(walletIndex?)`
| Param | Required | Type | Default | Example |
|-------|----------|------|---------|---------|
| `walletIndex` | ❌ | number | `0` | `0`, `1`, `2` |

**Output:** `{ address, network }`

#### `gnosis_getBalance(address?)`
| Param | Required | Type | Default |
|-------|----------|------|---------|
| `address` | ❌ | string | main wallet |

**Output:** `{ nativeBalance, nativeBalanceWei }`

#### `gnosis_transfer(to, amount)`
| Param | Required | Type | Example |
|-------|----------|------|---------|
| `to` | ✅ | string | `"0xd8dA6BF..."` |
| `amount` | ✅ | string | `"0.1"`, `"0.01"`, `"0.001"` |

**Output:** `{ txHash, status }`

#### `gnosis_getGasPrice()`
**Output:** `{ gasPrice, gasPriceGwei }`

---

## Market Intelligence (5 tools)

### `market_get_price_matrix(pairs?)`
Get real-time price matrix across CEX/DEX exchanges.
| Param | Required | Type | Description | Default |
|-------|----------|------|-------------|---------|
| `pairs` | ❌ | string[] | Trading pairs to scan | `["USDT/USDC", "DAI/USDC"]` |

**Output:** `{ timestamp, gasPriceGwei, ethPriceUsd, pairs, bestOpportunity }`

---

### `market_get_best_opportunity(minSpreadBps?)`
Find best arbitrage opportunity across exchanges.
| Param | Required | Type | Description | Default | Example |
|-------|----------|------|-------------|---------|---------|
| `minSpreadBps` | ❌ | number | Min spread in basis points | `15` | `15`, `20`, `50` |

**Output:** `{ found, opportunity, reason }`

---

### `market_calculate_profit(spreadBps, volumeUsd, buyExchange, sellExchange)`
Calculate profit breakdown for arbitrage trade.
| Param | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `spreadBps` | ✅ | number | Price spread in basis points | `"25"`, `"50"`, `"100"` |
| `volumeUsd` | ❌ | number | Trade volume in USD | `"1000"`, `"5000"`, `"10000"` |
| `buyExchange` | ❌ | string | Exchange to buy from | `"binance"`, `"uniswap"`, `"okx"` |
| `sellExchange` | ❌ | string | Exchange to sell to | `"uniswap"`, `"bybit"`, `"curve"` |

**Output:** `{ input, analysis }`

---

### `market_start_scanner()`
Start continuous market monitoring (5-second interval).
| Params | None |
|--------|------|
**Output:** `{ message, intervalMs }`

---

### `market_stop_scanner()`
Stop market monitoring service.
| Params | None |
|--------|------|
**Output:** `{ message }`

---

## Risk Level Summary

| Level | Count | Tools |
|-------|-------|-------|
| **low** | 26 | Balance queries, state getters, market scanners, X402 queries, ERC4337 read-only |
| **medium** | 21 | Deposits, withdrawals, swaps, supplies, approvals, ERC4337 operations |
| **high** | 13 | Transfers, bridges, borrows, engine cycles, ERC4337 execute/withdraw |

---

## Chain Support

| Chain | Network ID | Tools |
|-------|-----------|-------|
| Ethereum Sepolia | 11155111 | 31 (wdk-tools, wdk-protocol, erc4337, sepolia, market, x402) |
| Arbitrum Sepolia | 421614 | 4 (arbitrum) |
| Polygon Amoy | 80002 | 4 (polygon) |
| Gnosis Chiado | 10218 | 4 (gnosis) |

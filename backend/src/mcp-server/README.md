# OmniAgent MCP Server

Model Context Protocol (MCP) server exposing OmniAgent Multi-VM blockchain operations.

## Quick Start

The MCP server runs as an integrated HTTP endpoint in the unified backend server. Start the backend and access MCP via the `/api/mcp` endpoint:

```bash
# Start unified backend (includes MCP HTTP endpoint)
cd backend && pnpm run dev

# Test MCP endpoint
curl -X POST http://localhost:3001/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Available Tools (65+ total)

### X402 Agent Economy (4 tools)
| Tool | Description | Risk |
|------|-------------|------|
| `x402_pay_subagent` | Pay USDT to sub-agent for intelligence | Medium |
| `x402_list_services` | List available AI sub-agents | Low |
| `x402_get_balance` | Get X402 wallet balance | Low |
| `x402_fleet_status` | Get robot fleet earnings status | Low |

### WDK Vault & Engine (12 tools)
| Tool | Description | Risk |
|------|-------------|------|
| `wdk_vault_deposit` | Deposit USDT into vault | Medium |
| `wdk_vault_withdraw` | Withdraw from vault | Medium |
| `wdk_vault_getBalance` | Get vault balance | Low |
| `wdk_vault_getState` | Get full vault state | Low |
| `wdk_engine_executeCycle` | Execute yield cycle | High |
| `wdk_engine_getRiskMetrics` | Get risk metrics | Low |
| `wdk_engine_getCycleState` | Get cycle state | Low |
| `wdk_aave_supply` | Supply to Aave via WDK | Medium |
| `wdk_aave_withdraw` | Withdraw from Aave | Medium |
| `wdk_aave_getPosition` | Get Aave position | Low |
| `wdk_bridge_usdt0_status` | Get bridge quote/status | Low |
| `wdk_mint_test_token` | Mint test USDT (testnet only) | Low |

### WDK Protocol Tools (9 tools)
| Tool | Description | Risk |
|------|-------------|------|
| `wdk_lending_supply` | Supply to Aave lending pool | Medium |
| `wdk_lending_withdraw` | Withdraw from Aave | Medium |
| `wdk_lending_borrow` | Borrow from Aave | High |
| `wdk_lending_repay` | Repay Aave debt | Medium |
| `wdk_lending_getPosition` | Get position & health factor | Low |
| `wdk_bridge_usdt0` | Bridge USDT across chains | Medium |
| `wdk_swap_tokens` | Swap via Velora | Medium |
| `wdk_autonomous_cycle` | Run autonomous yield cycle | High |
| `wdk_autonomous_status` | Get agent state | Low |

### Market Data — Bitfinex (5 tools)
| Tool | Description | Risk |
|------|-------------|------|
| `market_get_price_matrix` | Get real-time prices from Bitfinex | Low |
| `market_get_best_opportunity` | Find best arbitrage opportunity | Low |
| `market_calculate_profit` | Calculate bridge profit/loss | Low |
| `market_start_scanner` | Start market scanner | Low |
| `market_stop_scanner` | Stop market scanner | Low |

**Supported pairs:** BTC/USD, ETH/USD, USDT/USD, XAUT/USD
**Exchange fees:** 0.1% maker / 0.2% taker

### ERC-4337 Smart Accounts (12 tools)
| Tool | Description | Risk |
|------|-------------|------|
| `erc4337_createAccount` | Create smart account | Low |
| `erc4337_execute` | Execute single operation | Medium |
| `erc4337_executeBatch` | Execute batch operations | Medium |
| `erc4337_getAccountAddress` | Get predicted address | Low |
| `erc4337_getBalance` | Get account balance | Low |
| `erc4337_addDeposit` | Add ETH deposit | Medium |
| `erc4337_withdrawNative` | Withdraw ETH | Medium |
| `erc4337_withdrawToken` | Withdraw ERC20 | Medium |
| `erc4337_setTokenApproval` | Approve token spend | Medium |
| `erc4337_isTokenApproved` | Check approval status | Low |
| `erc4337_getDeposit` | Get deposit info | Low |
| `erc4337_isValidAccount` | Validate account | Low |

### Session Keys (9 tools)
| Tool | Description | Risk |
|------|-------------|------|
| `smartaccount_create` | Create smart account with session keys | Low |
| `smartaccount_getAddress` | Get account address | Low |
| `smartaccount_grantSessionKey` | Grant session key with limits | Medium |
| `smartaccount_revokeSessionKey` | Revoke session key | Medium |
| `smartaccount_updateDailyLimit` | Update daily spending limit | Medium |
| `smartaccount_addAllowedTarget` | Add allowed target address | Medium |
| `smartaccount_removeAllowedTarget` | Remove allowed target | Medium |
| `smartaccount_getSessionKeyStatus` | Get session key status | Low |
| `smartaccount_listSessionKeys` | List all session keys | Low |

### Multi-Chain Wallets (22 tools)

| Chain | Tools | Description |
|-------|-------|-------------|
| **Sepolia** | 10 | `sepolia_createWallet`, `sepolia_getBalance`, `sepolia_transfer`, `sepolia_swap`, `sepolia_supplyAave`, `sepolia_withdrawAave`, `sepolia_bridgeLayerZero`, `sepolia_getNavInfo`, `sepolia_getCreditScore`, `sepolia_getTransactionHistory` |
| **Arbitrum** | 4 | `arbitrum_createWallet`, `arbitrum_getBalance`, `arbitrum_transfer`, `arbitrum_getGasPrice` |
| **Polygon** | 4 | `polygon_createWallet`, `polygon_getBalance`, `polygon_transfer`, `polygon_getGasPrice` |
| **Gnosis** | 4 | `gnosis_createWallet`, `gnosis_getBalance`, `gnosis_transfer`, `gnosis_getGasPrice` |

## PolicyGuard Integration

All transaction tools integrate with PolicyGuard:
- Daily volume limits
- Whitelisted recipients only
- Transaction logging for audit
- 4-layer governance pipeline (Hard Rules → Statistical Anomaly → AI Interpretation → Human Review)

## Environment

```bash
# .env
WDK_SECRET_SEED=your_seed
SEPOLIA_RPC_URL=https://ethereum-sepolia.publicnode.com
```

## Architecture

```
src/mcp-server/
├── handlers/
│   ├── wdk-tools.ts           # WDK Vault & Engine tools
│   ├── wdk-protocol-tools.ts  # WDK Protocol tools (lending, bridge, swap)
│   ├── x402-tools.ts          # X402 agent economy
│   ├── erc4337-tools.ts       # ERC-4337 smart accounts
│   ├── session-key-tools.ts   # Session key management
│   ├── sepolia-tools.ts       # Sepolia chain tools
│   ├── arbitrum-tools.ts      # Arbitrum chain tools
│   ├── polygon-tools.ts       # Polygon chain tools
│   ├── gnosis-tools.ts        # Gnosis chain tools
│   └── market-tools.ts        # Market data (Bitfinex)
├── tool-registry.ts           # Tool registration & execution
└── types/
    └── mcp-protocol.ts        # MCP protocol types
```

# OmniWDK MCP Server

Model Context Protocol (MCP) server exposing OmniWDK Multi-VM blockchain operations.

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

## Available Tools (32 total)

### X402 (4 tools)
| Tool | Description | Risk |
|------|-------------|------|
| `x402_getAvailableServices` | List available AI sub-agents | Low |
| `x402_getMyServices` | List registered services | Low |
| `x402_payForService` | Pay USDT for service | Medium |
| `x402_registerService` | Register new service | Medium |

### WDK Vault (4 tools)
| Tool | Description | Risk |
|------|-------------|------|
| `wdk_vault_deposit` | Deposit USDT into vault | Medium |
| `wdk_vault_withdraw` | Withdraw from vault | Medium |
| `wdk_vault_getBalance` | Get vault balance | Low |
| `wdk_vault_getSharePrice` | Get share price | Low |

### WDK Engine (3 tools)
| Tool | Description | Risk |
|------|-------------|------|
| `wdk_engine_execute` | Execute yield cycle | High |
| `wdk_engine_getRiskMetrics` | Get risk metrics | Low |
| `wdk_engine_getStatus` | Get engine status | Low |

### Account Abstraction (ERC-4337) (7 tools)
| Tool | Description | Risk |
|------|-------------|------|
| `aa_createAccount` | Create smart account | Low |
| `aa_sendUserOperation` | Send user operation | Medium |
| `aa_getAccountAddress` | Get account address | Low |
| `aa_getAccountInfo` | Get account info | Low |
| `aa_estimateUserOpGas` | Estimate gas | Low |
| `aa_getUserOpReceipt` | Get op receipt | Low |
| `aa_getSupportedEntryPoints` | Get entry points | Low |

### BNB Chain (7 tools)
| Tool | Description | Risk |
|------|-------------|------|
| `bnb_createWallet` | Create/retrieve BNB wallet | Low |
| `bnb_getBalance` | Get BNB/USDT balance | Low |
| `bnb_transfer` | Transfer BNB/USDT | Medium |
| `bnb_swap` | Swap tokens via PancakeSwap | Medium |
| `bnb_lend` | Lend via Venus | Medium |
| `bnb_bridge` | Bridge via LayerZero | High |

### Solana (4 tools)
| Tool | Description | Risk |
|------|-------------|------|
| `sol_createWallet` | Create/retrieve Solana wallet | Low |
| `sol_getBalance` | Get SOL/USDC balance | Low |
| `sol_transfer` | Transfer SOL/USDC | Medium |
| `sol_swap` | Swap via Jupiter | Medium |

### TON (3 tools)
| Tool | Description | Risk |
|------|-------------|------|
| `ton_createWallet` | Create/retrieve TON wallet | Low |
| `ton_getBalance` | Get TON balance | Low |
| `ton_transfer` | Transfer TON | Medium |

## PolicyGuard Integration

All transaction tools integrate with PolicyGuard:
- Daily volume limits
- Whitelisted recipients only
- Transaction logging for audit

## Environment

```bash
# .env.wdk
WDK_SECRET_SEED=your_seed
BNB_RPC_URL=https://bsc-testnet-dataseed.bnbchain.org
SOLANA_RPC_URL=https://api.testnet.solana.com
TON_RPC_URL=https://testnet.toncenter.com
```

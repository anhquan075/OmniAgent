# OmniWDK 🧱🏦

**OmniWDK** is an autonomous, non-custodial yield routing stack built on BNB Chain and powered by **Tether WDK** (Wallet Development Kit). It manages USD₮-denominated capital by dynamically routing it between high-yield staking pools and "Safe Haven" assets like XAU₮ (Tether Gold).

<p align="center">
  <img src="frontend/public/logo.svg" alt="OmniWDK Logo" width="120" height="120" />
</p>

## Key Features

- **Tether WDK Foundation**: Fully non-custodial wallet management for EVM, Solana, and TON using a single seed phrase.
- **AI-Managed Autonomy**: An autonomous AI agent loop (`agent/loop.js`) that monitors yield differentials and triggers rebalances without human intervention.
- **"Agent Brain" Dashboard**: A real-time visualization board showing the agent's thought process, risk analysis, and omnichain actions.
- **ZK-Verified Risk Scoring**: Trustless, cryptographic verification of off-chain risk metrics via the `ZKRiskOracle`.
- **Dutch Auction Rebalancing**: MEV-resistant execution via Rebalance Rights Auctions (RRA).
- **Gold-Backed Safety**: Uses **XAU₮ (Tether Gold)** as a primary rebalancing target during market volatility.

## Technical Whitepaper

For a deep dive into our ZK-risk implementation and RRA economics, see our [HACKATHON.md](./HACKATHON.md).

## Architecture

1. **WDKVault.sol**: The core ERC-4626 vault that manages USD₮ and routes it to specific adapters.
2. **StrategyEngine.sol**: The logic layer that computes optimal allocations based on the `RiskPolicy`.
3. **ExecutionAuction.sol**: Competitive auction layer for rebalance rights (RRA).
4. **XAUTYieldAdapter.sol**: A specialized adapter that manages XAU₮ holdings.
5. **WDK Omnichain Agent**: A Node.js agent that handles non-custodial signing across BNB, SOL, and TON.

## Getting Started

### Prerequisites

- Node.js 18+
- Hardhat
- A WDK-compatible seed phrase

### Installation

```bash
npm install
```

### Configuration

1. Copy `.env.example` to `.env` for Hardhat deployment settings.
2. Create `.env.wdk` for agent settings:

```bash
# Tether WDK Configuration
WDK_SECRET_SEED="your twelve word mnemonic phrase here"
BNB_RPC_URL=https://binance.llamarpc.com
WDK_VAULT_ADDRESS=0x...
WDK_ENGINE_ADDRESS=0x...
```

### Running the System

1. **Start the Agent API** (Webhooks, API, SSE):
   ```bash
   node agent/api.js
   ```

2. **Start the Autonomous Loop**:
   ```bash
   node agent/loop.js
   ```

3. **Open the Dashboard**:
   ```bash
   cd frontend && npm run dev
   ```

Expose the vault tools to your AI assistant via MCP:
```bash
npm run agent:mcp
```

## Deployment (WDK Stack)

To deploy the Tether-focused stack on a testnet:
```bash
npx hardhat run scripts/wdk/DeployWDKStack.js --network bnbTestnet
```

## Security

- **Non-Custodial**: Neither the agent nor the contracts can move funds to unauthorized addresses.
- **Circuit Breaker**: Multi-signal breaker that pauses rebalances if USD₮ depegs or volatility spikes.
- **Bounty Driven**: Permissionless rebalance triggers are incentivized via a Dutch auction bounty.

---
Built for the **Tether WDK Hackathon 2026**.

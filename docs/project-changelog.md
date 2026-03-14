# AsterPilot ProofVault Project Changelog

## [2.2.0] - 2026-03-13 (Tether WDK Adaptation)

### Added
- **Tether WDK Foundation**: 
  - Integrated `@tetherto/wdk` for non-custodial wallet management.
  - Multi-chain wallet derivation (EVM, Solana, TON) from a single agent seed.
  - Autonomous transaction signing logic for vault rebalances.
- **Gold-Backed Safety**:
  - `XAUTYieldAdapter`: Specialized adapter for Tether Gold (XAU₮) capital preservation.
  - Value-reporting logic converts XAU₮ holdings into USD₮ equivalents for vault accounting.
- **Autonomous AI Strategist**:
  - `agent/loop.js`: Self-driving rebalance loop that monitors market conditions and executes cycles.
  - Logic-driven triggering based on regime shifts and bounty profitability.
- **MCP Server Integration**:
  - Model Context Protocol server exposing `get_vault_status`, `deposit`, and `execute_cycle` to AI assistants.
- **WDK Deployment Stack**:
  - `scripts/wdk/DeployWDKStack.js`: Unified deployment script for Tether-centric assets and adapters.

### Changed
- **Project Rebranding**: Renamed project to `TetherProof-WDK` in `package.json` and `README.md`.
- **Asset Configuration**: Standardized `ProofVault` to use USD₮ as the primary underlying asset.
- **Strategy Refactor**: Updated `StrategyEngine` and `RiskPolicy` to prioritize XAU₮ safety rails during high-volatility states.
- **Environment Management**: Added `.env.wdk` for secure, agent-specific configuration (ignored by git).

## [2.1.0] - 2026-03-12 (Polkadot Hub Adaptation)
... (rest of the file)

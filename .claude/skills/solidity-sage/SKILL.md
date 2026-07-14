---
name: solidity-sage
description: Write secure smart contracts with Solidity mastery for AsterPilot ProofVault. Expert in gas optimization, security patterns, and DeFi protocols. Activate for smart contract development, auditing, or blockchain architecture in this repository.
license: MIT
version: 1.0.0
---

# Solidity Sage — AsterPilot ProofVault

You are a Solidity expert who writes contracts that handle millions safely. In blockchain, bugs are forever. Test everything, audit twice, deploy once.

## Repository Context

This is the **AsterPilot ProofVault** repository — a DeFi yield aggregation protocol on BNB Chain. Key contracts:

| Contract | Purpose |
|---|---|
| `ProofVault.sol` | ERC-4626 yield vault with multi-rail strategy allocation |
| `AsterEarnAdapter.sol` / `AsterEarnAdapterV2WithSwap.sol` | Adapters for the AsterEarn external yield protocol |
| `StableSwapLPYieldAdapterWithFarm.sol` | StableSwap LP farm yield adapter |
| `ExecutionAuction.sol` | Rebalancing rights auction (RRA) mechanism |
| `StrategyEngine.sol` | Multi-rail strategy orchestration |
| `RiskPolicy.sol` | Risk parameter governance |
| `SharpeTracker.sol` | On-chain Sharpe ratio tracking |
| `ChainlinkPriceOracle.sol` | Chainlink price feed wrapper |
| `CircuitBreaker.sol` | Signal-based circuit breaker guard |
| `PegArbExecutor.sol` | Peg arbitrage executor |
| `ManagedAdapter.sol` | Base adapter interface |

Interfaces live in `contracts/interfaces/`. Test mocks live in `contracts/mocks/`.

## Development Standards

Follow all rules in `.github/skills/solidity-sage/development-standards.md` — Cyfrin security standards.

Core principles (always apply):
1. **Revert early and often** — validate inputs before storage reads
2. **Check-Effects-Interactions** — prevent reentrancy vulnerabilities
3. **Named imports only** — absolute paths, no relative imports
4. **Custom errors over require** — prefix with `ContractName__`
5. **Immutability by default** — use `immutable` for single-set values
6. **Storage packing** — pack variables to minimize SLOAD/SSTORE costs
7. **Cache storage reads** — prevent redundant SLOAD operations

## DeFi Patterns

Refer to `.github/skills/solidity-sage/defi-patterns.md` for AMM, ERC-4626, oracle integration, flash loan protection, governance patterns, and upgrade proxy patterns.

## Security Checklist

Before submitting any contract changes:
- [ ] ReentrancyGuard applied (`nonReentrant` before other modifiers)
- [ ] Access control verified (`Ownable2Step` or role-based)
- [ ] Oracle staleness & price bounds checked
- [ ] Circuit breaker integration considered for high-value flows
- [ ] CEI pattern enforced in all state-changing functions
- [ ] Custom errors replace all `require` strings
- [ ] Events emitted for all state transitions
- [ ] NatSpec on all `public`/`external` functions
- [ ] No private keys or secrets in code

## Testing

- Framework: **Hardhat** with `hardhat-toolbox`
- Run: `npm test` or `npx hardhat test`
- Mainnet fork: configured in `hardhat.config.js` using `BNB_MAINNET_RPC_URL`
- Test files live in `test/` — follow existing test file naming pattern
- Write fuzz tests for numeric inputs
- Test all revert conditions explicitly

## Deployment

Scripts in `scripts/`. Follow existing patterns (e.g., `deploy-v2-full-stack.js`).
- Always separate deployer wallet from admin/owner wallet
- Verify contracts on BscScan after deployment
- Record addresses in `docs/mainnet-address-registry.md`

## References

- `.github/skills/solidity-sage/development-standards.md` — Complete Solidity coding standards
- `.github/skills/solidity-sage/defi-patterns.md` — DeFi protocol patterns
- `docs/mainnet-address-registry.md` — Deployed contract addresses
- `docs/farm-integration-addresses.md` — BNB Chain farm/LP addresses

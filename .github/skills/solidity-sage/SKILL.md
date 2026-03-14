---
name: solidity-sage
description: >
  Write secure, gas-optimized Solidity smart contracts for this repository.
  Use this skill when asked to develop, audit, review, or optimize smart contracts,
  DeFi protocols, yield strategies, adapters, vaults, or any on-chain logic in the
  contracts/ directory.
---

# Solidity Sage

You are a Solidity expert who writes contracts that handle millions safely. In blockchain, bugs are forever. Test everything, audit twice, deploy once.

## Repository Context

This is the **AsterPilot ProofVault** repository — a DeFi yield aggregation protocol on BNB Chain featuring:
- **ProofVault** — ERC-4626 yield vault with multi-rail strategy allocation
- **AsterEarnAdapter / AsterEarnAdapterV2** — Adapters for external yield protocols
- **ExecutionAuction** — Rebalancing rights auction mechanism
- **StableSwapLPYieldAdapter** — LP farm yield adapter
- **StrategyEngine / RiskPolicy / SharpeTracker** — Strategy management layer
- **ChainlinkPriceOracle / CircuitBreaker** — Price feeds and circuit breaker guards

Always follow the project structure in `contracts/` and respect existing interface contracts in `contracts/interfaces/`.

## Code Quality Standards

Follow all rules in `development-standards.md` — Solidity code quality, style, and best practices from the Cyfrin security team.

Core principles:
1. **Revert early and often** — validate inputs before storage reads
2. **Check-Effects-Interactions** — prevent reentrancy vulnerabilities
3. **Named imports only** — absolute paths, no relative imports
4. **Custom errors over require** — prefix with `ContractName__`
5. **Immutability by default** — use `immutable` for single-set values
6. **Storage packing** — pack variables to minimize slots
7. **Cache storage reads** — prevent redundant SLOAD operations

## DeFi Patterns

Refer to `defi-patterns.md` for:
- AMM mechanics and constant product formulas
- Lending protocol patterns and interest rate models
- ERC-4626 vault implementation
- Oracle integration with staleness checks
- Flash loan protection
- Governance and voting patterns
- Proxy and UUPS upgrade patterns
- Invariant and fuzz testing strategies

## Security Philosophy

**Everything will be attacked** — Assume any code will be attacked and write defensively.

### Critical Security Checklist
- [ ] ReentrancyGuard (`nonReentrant` before other modifiers)
- [ ] Access control gated (`Ownable2Step`, RBAC, or role-based)
- [ ] Oracle staleness checks and price sanity bounds
- [ ] Circuit breaker integration where high-value flows exist
- [ ] No unprotected `delegatecall`
- [ ] CEI pattern enforced in all state-changing functions
- [ ] Flash loan attack vectors reviewed
- [ ] No front-running exposure in auction or swap logic
- [ ] Events emitted for all important state transitions
- [ ] NatSpec comments on all public/external functions

## When Writing New Contracts

1. Check `contracts/interfaces/` for existing interface definitions to implement
2. Check `contracts/mocks/` pattern for test doubles
3. Follow the file layout from `development-standards.md` (pragma → imports → events → errors → interfaces → libraries → contract)
4. Add contract to `hardhat.config.js` compilation if a standalone artifact is required
5. Create a corresponding test file in `test/` using the existing test patterns

## When Auditing Existing Contracts

1. Scan all external calls for CEI violations
2. Check all access control modifiers
3. Verify oracle data freshness and bounds
4. Review storage layout for packing efficiency
5. Check for redundant storage reads that can be cached
6. Verify all revert paths use custom errors

## Deployment

Deploy scripts live in `scripts/`. Follow existing patterns (e.g., `deploy-v2-full-stack.js`). Always:
- Separate deployer wallet from admin/owner wallet
- Verify contracts on BscScan after deployment
- Record deployed addresses in `docs/mainnet-address-registry.md`
- Update `docs/v2-deployment-summary.md`

## Testing Standards

- Use Hardhat with `hardhat-toolbox` (already configured)
- Write fuzz tests where numeric inputs are involved
- Test all revert conditions explicitly
- Fork BNB Chain mainnet for integration tests: `npx hardhat test --network hardhat` (mainnet fork is configured)
- Aim for 100% branch coverage on critical vault and adapter logic

## References

- `development-standards.md` — Complete Solidity coding standards (Cyfrin)
- `defi-patterns.md` — DeFi protocol patterns and code snippets
- `docs/mainnet-address-registry.md` — Deployed contract addresses
- `docs/farm-integration-addresses.md` — Farm/LP pool addresses on BNB Chain

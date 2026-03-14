# ProofVault V2 — BSC Mainnet Address Registry

Deployed: 2026-02-27 (v2 r5 — fix correct USDF address 0x5A110fC = Astherus USDF; fix exchange coin indices exchange(0,1) for USDT→USDF)
Deployer: `0xB789D888A53D34f6701C1A5876101Cb32dbF17cF`
Script: `scripts/deploy-mainnet-full-stack.js`
Chain: BNB Chain Mainnet (Chain ID 56)
Gas price: 0.1 gwei

## V2 Contracts

| Contract                   | Address                                      |
| -------------------------- | -------------------------------------------- |
| ProofVault                 | `0x2db50C57F8F3D64bF9EfD8e387b460C744c3B5a8` |
| StrategyEngine             | `0x0b62Db1A942b4346F99516746b883eb848292126` |
| RiskPolicy                 | `0xfC01B5b5Feb7Cd83E33156D3e1ea55Cc33DF501F` |
| ChainlinkPriceOracle       | `0x8cBdf5Ecf1e8851BD94ec717956D2DA3f4FF81a1` |
| CircuitBreaker             | `0x7B64283e43A15DCE74517a9B43Bcb110ABcb9bD6` |
| SharpeTracker              | `0x51cB598F207E8D7Aee8138864e8Ec22313c4bA66` |
| AsterEarnAdapter           | `0x636888514c3a475817eDc71F2000460925Ff1399` |
| ManagedAdapter (secondary) | `0xFE4680524fdFEF452CeD1fafF5319CD05380E92b` |
| StableSwapLPAdapter        | `0xDb5a6b027EA60bdbec6D45212F353Ee9a6099009` |
| PegArbExecutor             | `0x178Ea822aDa80c21385CEB0E153D887Dd50b8779` |
| ExecutionAuction           | `0xa9F21bCCD4B4Be87EE8Cb6Ab1841B6597513CDdc` |

## External Dependencies

| Name                 | Address                                      |
| -------------------- | -------------------------------------------- |
| USDT (BSC)           | `0x55d398326f99059fF775485246999027B3197955` |
| USDF (Astherus USDF) | `0x5A110fC00474038f6c02E89C707D638602EA44B5` |
| AsterDEX Minter      | `0xdB57a53C428a9faFcbFefFB6dd80d0f427543695` |
| Chainlink USDT/USD   | `0xB97Ad0E74fa7d920791E90258A6E2085088b4320` |
| USDF/USDT StableSwap | `0x176f274335c8B5fD5Ec5e8274d0cf36b08E44A57` |
| MasterChef (LP farm) | `0x556B9306565093C855AEA9AE92A594704c2Cd59e` |
| LP Pool ID           | 69                                           |

## Configuration

| Parameter                     | Value                      |
| ----------------------------- | -------------------------- |
| Rail 1 (Aster) bps — Normal   | 2000 (20%)                 |
| Rail 1 (Aster) bps — Guarded  | 5000 (50%)                 |
| Rail 1 (Aster) bps — Drawdown | 7000 (70%)                 |
| Idle buffer                   | 500 bps (5%)               |
| Cycle cooldown                | 300s (5 min)               |
| Guarded volatility threshold  | 150 bps (1.5%)             |
| Drawdown volatility threshold | 500 bps (5%)               |
| Depeg price                   | $0.97                      |
| Sharpe window                 | 20 cycles                  |
| Circuit breaker Signal A      | 50 bps Chainlink deviation |
| Circuit breaker Signal B      | 8000 bps reserve imbalance |
| Circuit breaker Signal C      | 50 bps virtual price drop  |
| CB recovery cooldown          | 3600s (1 hr)               |

## BscScan Verification

```bash
npx hardhat verify --network bnb 0x2db50C57F8F3D64bF9EfD8e387b460C744c3B5a8 \
  "0x55d398326f99059fF775485246999027B3197955" \
  "AsterPilot ProofVault V2 Share" \
  "apvV2SHARE" \
  "0xB789D888A53D34f6701C1A5876101Cb32dbF17cF" \
  500
```

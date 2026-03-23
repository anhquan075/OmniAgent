import { ethers } from 'ethers';
import { hashkeyProvider } from '@/contracts/clients/ethers';
import { getHashKeySigner } from '@/lib/wdk-loader';
import { GovernancePipeline } from '@/agent/services/GovernancePipeline';
import { RiskService } from '@/agent/services/RiskService';

const HASHKEY_RPC = 'https://testnet.hsk.xyz';
const SUPRA_PROXY = '0x443A0f4Da5d2fdC47de3eeD45Af41d399F0E5702';

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  OmniAgent — HashKey Chain Yield Demo      ║');
  console.log('║  Autonomous AI Capital Allocator           ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const wallet = await getHashKeySigner();
  const address = await wallet.getAddress();
  console.log(`[1] Agent Wallet: ${address}`);

  const balance = await hashkeyProvider.getBalance(address);
  console.log(`    HSK Balance: ${ethers.formatEther(balance)}\n`);

  console.log('[2] Checking KYC Status...');
  const kycAddress = process.env.HASHKEY_KYC_SBT_ADDRESS;
  if (!kycAddress) {
    console.log('    ⚠ HASHKEY_KYC_SBT_ADDRESS not set — KYC check skipped\n');
  } else {
    try {
      const kyc = new ethers.Contract(kycAddress, [
        'function isHuman(address) view returns (bool isValid, uint8 level)',
        'function getKycInfo(address) view returns (string ensName, uint8 level, uint8 status, uint256 updatedAt)'
      ], hashkeyProvider);
      const [isValid, level] = await kyc.isHuman(address) as [boolean, number];
      const levelNames = ['NONE', 'BASIC', 'ADVANCED', 'PREMIUM', 'ULTIMATE'];
      console.log(`    KYC Valid: ${isValid} | Level: ${levelNames[level] || level}\n`);
      if (!isValid || level < 2) {
        console.log('    ❌ KYC Level 2+ required — demo cannot proceed\n');
        return;
      }
    } catch (e) {
      console.log(`    KYC contract call failed: ${e instanceof Error ? e.message : e}\n`);
    }
  }

  console.log('[3] Fetching SUPRA Oracle Price...');
  const pairBytes = ethers.encodeBytes32String('HSK-USD');
  try {
    const supra = new ethers.Contract(SUPRA_PROXY, [
      'function getPrice(bytes32 pair) view returns (int256 price, uint256 updatedAt)'
    ], hashkeyProvider);
    const [price, updatedAt] = await supra.getPrice(pairBytes) as [ethers.BigNumberish, number];
    const priceNum = Number(ethers.formatUnits(price, 8));
    console.log(`    HSK/USD: $${priceNum.toFixed(4)} | Updated: ${new Date(updatedAt * 1000).toISOString()}\n`);
  } catch (e) {
    console.log(`    SUPRA oracle call failed: ${e instanceof Error ? e.message : e}\n`);
  }

  console.log('[4] 4-Layer Governance Pipeline\n');
  const riskService = new RiskService();
  const pipeline = new GovernancePipeline(riskService);

  const txInput = {
    toAddress: process.env.HASHKEY_VAULT_ADDRESS || '0x0000000000000000000000000000000000000000',
    amount: '1000000',
    transactionType: 'supply' as const,
    chain: 'hashkey' as const,
  };
  console.log(`    Simulating: supply 1 USDT to vault`);

  const { result } = await pipeline.processTransaction(address, txInput);

  console.log('\n    ┌─────────────────────────────────────────┐');
  console.log(`    │ Layer 0: KYC Gate        → ${result.layers.kyc.passed ? '✓ PASS' : '✗ FAIL'}    │`);
  if (result.layers.kyc.level) console.log(`    │    Level: ${result.layers.kyc.level} (ADVANCED required)       │`);
  console.log(`    ├─────────────────────────────────────────┤`);
  console.log(`    │ Layer 1: Hard Rules      → ${result.layers.rules.passed ? '✓ PASS' : '✗ FAIL'}    │`);
  if (result.layers.rules.reason) console.log(`    │    ${result.layers.rules.reason.substring(0, 35)}     │`);
  console.log(`    ├─────────────────────────────────────────┤`);
  console.log(`    │ Layer 2: Anomaly Detect → ${result.layers.anomaly.isAnomaly ? '⚠ FLAG' : '✓ PASS'}    │`);
  if (result.layers.anomaly.reason) console.log(`    │    ${result.layers.anomaly.reason.substring(0, 35)}     │`);
  console.log(`    ├─────────────────────────────────────────┤`);
  console.log(`    │ Layer 3: AI Interpretation → ${result.layers.ai.riskScore < 70 ? '✓ PASS' : result.layers.ai.riskScore < 90 ? '⚠ FLAG' : '✗ FAIL'}   │`);
  console.log(`    │    Risk Score: ${result.layers.ai.riskScore}/100               │`);
  console.log(`    │    ${result.layers.ai.explanation.substring(0, 35)}     │`);
  console.log('    └─────────────────────────────────────────┘');

  console.log(`\n    Final Decision: ${result.outcome}`);
  if (result.rejectReason) console.log(`    Rejection Reason: ${result.rejectReason}`);
  if (result.autoApproveReason) console.log(`    Auto-Approve: ${result.autoApproveReason}`);
  if (result.flagReason) console.log(`    Flag Reason: ${result.flagReason}`);

  console.log('\n[5] MCP Tools Available on HashKey Chain:');
  console.log('    hashkey_createWallet   — Create deterministic wallet');
  console.log('    hashkey_getBalance     — Query HSK + ERC-20 balance');
  console.log('    hashkey_transfer       — Transfer HSK or tokens');
  console.log('    hashkey_vaultDeposit   — Deposit into ERC-4626 vault');
  console.log('    hashkey_vaultWithdraw — Withdraw from vault');
  console.log('    hashkey_checkKyc       — Verify KYC level');
  console.log('    hashkey_getVaultState  — Get vault NAV + yields');
  console.log('    hashkey_getOraclePrice — Query SUPRA oracle');
  console.log('    hashkey_getSafeTxStatus — Pending Safe txs');
  console.log('    hashkey_executeSafeTx  — Execute via multisig');
  console.log('    hashkey_getNetworkInfo  — Chain ID, block, gas');

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  Demo Complete                             ║');
  console.log('║  Chain: HashKey Chain Testnet (chain 133)  ║');
  console.log('║  Oracle: SUPRA Pull Oracle                 ║');
  console.log('║  Gate: On-chain KYC Level 2+              ║');
  console.log('╚══════════════════════════════════════════════╝');
}

main().catch(console.error);

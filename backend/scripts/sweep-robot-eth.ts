/**
 * Sweep ETH from robot fleet wallets back to a single address.
 * 
 * Usage: npx tsx scripts/sweep-robot-eth.ts
 * 
 * Robots are derived from WDK_SECRET_SEED with paths 0'/{0-7}/0
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env', override: true });

const SEED_PHRASE = process.env.WDK_SECRET_SEED || '';
const RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia.publicnode.com';
const TARGET_ADDRESS = '0xB789D888A53D34f6701C1A5876101Cb32dbF17cF';
const FLEET_SIZE = 8;
const GAS_LIMIT = 21000n;
const GAS_PRICE_BUFFER = 1.2; // 20% buffer on gas price

interface SweepResult {
  robotId: number;
  address: string;
  balance: string;
  sent: string;
  txHash?: string;
  error?: string;
}

async function main() {
  console.log('=== Robot Fleet ETH Sweeper ===');
  console.log(`Target: ${TARGET_ADDRESS}`);
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Fleet Size: ${FLEET_SIZE}\n`);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  // Check target address exists
  const targetCode = await provider.getCode(TARGET_ADDRESS);
  if (targetCode !== '0x') {
    console.log(`Warning: Target address appears to be a contract`);
  }

  const hdNode = ethers.Wallet.fromPhrase(SEED_PHRASE);
  const results: SweepResult[] = [];
  let totalSwept = 0n;

  for (let i = 0; i < FLEET_SIZE; i++) {
    const path = `0'/${i}/0`;
    const wallet = hdNode.derivePath(path).connect(provider);
    const address = wallet.address;
    
    console.log(`\n[ROBO-${String(i + 1).padStart(3, '0')}] ${address}`);
    
    try {
      const balance = await provider.getBalance(address);
      const balanceEth = ethers.formatEther(balance);
      console.log(`  Balance: ${balanceEth} ETH`);
      
      if (balance === 0n) {
        console.log('  Skipping - zero balance');
        results.push({ robotId: i, address, balance: balanceEth, sent: '0' });
        continue;
      }

      // Calculate gas cost
      const gasPrice = await provider.getGasPrice();
      const bufferedGasPrice = BigInt(Math.ceil(Number(gasPrice) * GAS_PRICE_BUFFER));
      const gasCost = GAS_LIMIT * bufferedGasPrice;
      
      // Calculate send amount (balance - gas)
      const sendAmount = balance - gasCost;
      
      if (sendAmount <= 0n) {
        console.log(`  Skipping - balance (${balanceEth} ETH) too low to cover gas`);
        results.push({ robotId: i, address, balance: balanceEth, sent: '0', error: 'Insufficient for gas' });
        continue;
      }

      const sendAmountEth = ethers.formatEther(sendAmount);
      const gasCostEth = ethers.formatEther(gasCost);
      console.log(`  Sending: ${sendAmountEth} ETH (gas: ${gasCostEth} ETH)`);
      
      // Send transaction
      const tx = await wallet.sendTransaction({
        to: TARGET_ADDRESS,
        value: sendAmount,
        gasLimit: GAS_LIMIT,
        gasPrice: bufferedGasPrice
      });
      
      console.log(`  TX Hash: ${tx.hash}`);
      console.log('  Waiting for confirmation...');
      
      const receipt = await tx.wait();
      
      if (receipt && receipt.status === 1) {
        console.log(`  ✓ Confirmed in block ${receipt.blockNumber}`);
        totalSwept += sendAmount;
        results.push({ robotId: i, address, balance: balanceEth, sent: sendAmountEth, txHash: tx.hash });
      } else {
        console.log('  ✗ Transaction failed');
        results.push({ robotId: i, address, balance: balanceEth, sent: '0', txHash: tx.hash, error: 'Failed' });
      }
      
    } catch (error: any) {
      console.log(`  ✗ Error: ${error.message}`);
      results.push({ robotId: i, address, balance: '0', sent: '0', error: error.message });
    }
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Target: ${TARGET_ADDRESS}`);
  console.log(`Total Swept: ${ethers.formatEther(totalSwept)} ETH`);
  console.log('\nDetails:');
  
  for (const r of results) {
    const status = r.error ? `✗ ${r.error}` : (r.sent !== '0' ? `✓ ${r.sent} ETH` : '- skipped');
    console.log(`  ROBO-${String(r.robotId + 1).padStart(3, '0')}: ${status}`);
    if (r.txHash) {
      console.log(`    TX: https://sepolia.etherscan.io/tx/${r.txHash}`);
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

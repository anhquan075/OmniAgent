import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env', override: true });

const USDT = process.env.WDK_USDT_ADDRESS!;
const RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia.publicnode.com';
const provider = new ethers.JsonRpcProvider(RPC);

async function main() {
  const { default: WalletManagerEvm } = await import('@tetherto/wdk-wallet-evm');
  const wm = new WalletManagerEvm(process.env.WDK_SECRET_SEED!, { provider: RPC });
  
  const usdt = new ethers.Contract(USDT, [
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)'
  ], provider);

  console.log('=== Robot Wallet Balances ===\n');
  
  for (let i = 0; i < 8; i++) {
    const account = await wm.getAccount(`0'/${i}/0`);
    const address = await account.getAddress();
    const bal = await usdt.balanceOf(address);
    const ethBal = await provider.getBalance(address);
    console.log(`Robot ${i}: ${address}`);
    console.log(`  USDT: ${ethers.formatUnits(bal, 6)}`);
    console.log(`  ETH:  ${ethers.formatEther(ethBal)}`);
    console.log();
  }
  
  wm.dispose();
}

main().catch(console.error);

import { ethers } from 'ethers';
import * as fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const [k,...v] = l.split('='); return [k, v.join('=')]; }));
const provider = new ethers.JsonRpcProvider(env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
const usdt = new ethers.Contract('0xd077a400968890eacc75cdc901f0356c943e4fdb', [
  'function mint(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)'
], wallet);
async function main() {
  const bal = await usdt.balanceOf(wallet.address);
  console.log('Before:', ethers.formatUnits(bal, 6), 'USDT');
  const tx = await usdt.mint(wallet.address, ethers.parseUnits('5000', 6));
  const r = await tx.wait();
  console.log('TX status:', r?.status, r?.hash);
  const bal2 = await usdt.balanceOf(wallet.address);
  console.log('After:', ethers.formatUnits(bal2, 6), 'USDT');
}
main().catch(console.error);

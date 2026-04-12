import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');

const w1 = new ethers.Wallet('455bb04dd9c7c8d71faaf5218b1565053bf34188c7079765bc909669fee0d7a5', provider);
const w2 = new ethers.Wallet('0xb94e30b9827852ef3dfa000b6041b6548d0bce4b6c5413801a84c7670f0a4b4b', provider);

const usdt = new ethers.Contract('0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0', ['function transfer(address,uint256)'], w2);

async function main() {
  console.log('w1:', w1.address);
  console.log('w2:', w2.address);
  console.log('w1 bal:', (await provider.getBalance(w1.address)).toString());
  console.log('w2 bal:', (await provider.getBalance(w2.address)).toString());

  console.log('Sending gas...');
  const tx1 = await w1.sendTransaction({ to: w2.address, value: ethers.parseEther('0.005') });
  console.log('Gas tx:', tx1.hash);
  const r1 = await tx1.wait();
  console.log('Gas confirmed:', r1?.blockNumber);

  console.log('Waiting 10s...');
  await new Promise(r => setTimeout(r, 10000));

  console.log('w2 bal after:', (await provider.getBalance(w2.address)).toString());

  console.log('Transferring USDT...');
  const tx2 = await usdt.transfer(w1.address, '5000000000');
  console.log('USDT tx:', tx2.hash);
  const r2 = await tx2.wait();
  console.log('USDT confirmed:', r2?.blockNumber);
}

main().catch(console.error);
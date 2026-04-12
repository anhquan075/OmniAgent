import { ethers } from 'ethers';

const p = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
const w1 = new ethers.Wallet('455bb04dd9c7c8d71faaf5218b1565053bf34188c7079765bc909669fee0d7a5', p);
const w2 = new ethers.Wallet('0xb94e30b9827852ef3dfa000b6041b6548d0bce4b6c5413801a84c7670f0a4b4b', p);

console.log('Gas wallet:', w1.address);
console.log('USDT wallet:', w2.address);

const usdt = new ethers.Contract('0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0', ['function transfer(address,uint256)'], w2);

async function run() {
  console.log('Sending 0.005 ETH for gas...');
  const gasTx = await w1.sendTransaction({ to: w2.address, value: ethers.parseEther('0.005') });
  await gasTx.wait();
  
  await new Promise(r => setTimeout(r, 5000));
  
  console.log('Transferring 5000 USDT...');
  const tx = await usdt.transfer('0xCd0B4044d6A477Aa69a040a3d866ee94D4511C1E', '5000000000');
  await tx.wait();
  console.log('✅ Done! TX:', tx.hash);
}

run().catch(console.error);
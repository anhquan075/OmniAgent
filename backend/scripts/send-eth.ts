import { ethers } from 'ethers';

const SEPOLIA_RPC = 'https://ethereum-sepolia.publicnode.com';
const RECIPIENT = '0xB789D888A53D34f6701C1A5876101Cb32dbF17cF';
const AMOUNT = '0.01';

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Set PRIVATE_KEY env');
    process.exit(1);
  }
  
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const wallet = new ethers.Wallet(privateKey, provider);
  
  console.log('From:', wallet.address);
  console.log('To:', RECIPIENT);
  console.log('Amount:', AMOUNT, 'ETH');
  
  const tx = await wallet.sendTransaction({
    to: RECIPIENT,
    value: ethers.parseEther(AMOUNT)
  });
  
  console.log('TX sent:', tx.hash);
  console.log('Waiting for confirmation...');
  
  const receipt = await tx.wait();
  console.log('✅ Confirmed! Block:', receipt.blockNumber);
}

main().catch(console.error);
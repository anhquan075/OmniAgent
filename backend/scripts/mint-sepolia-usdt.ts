import { ethers } from 'ethers';

const SEPOLIA_RPC = 'https://ethereum-sepolia.publicnode.com';
const USDT_ADDRESS = '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0';
const RECIPIENT = '0xB789D888A53D34f6701C1A5876101Cb32dbF17cF';
const MINT_AMOUNT = '100000000000'; // 100k USDT (6 decimals)

const ABI = [
  'function owner() view returns (address)',
  'function mint(address account, uint256 value) returns (bool)'
];

async function main() {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  
  // Check if private key is set
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ Please set PRIVATE_KEY in .env');
    process.exit(1);
  }
  
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log('📋 Wallet:', wallet.address);
  
  const contract = new ethers.Contract(USDT_ADDRESS, ABI, wallet);
  
  // Check owner
  const owner = await contract.owner();
  console.log('🔐 Contract owner:', owner);
  console.log('👤 Your address:', wallet.address);
  
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error('❌ You are not the owner! Only owner can mint.');
    process.exit(1);
  }
  
  console.log('✅ You are the owner, proceeding to mint...');
  
  const tx = await contract.mint(RECIPIENT, MINT_AMOUNT);
  console.log('📤 Transaction sent:', tx.hash);
  
  const receipt = await tx.wait();
  console.log('✅ Minted! Transaction confirmed in block:', receipt.blockNumber);
}

main().catch(console.error);
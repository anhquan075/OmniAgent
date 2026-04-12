import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY not set in .env');
  }

  const provider = new ethers.JsonRpcProvider('https://testnet.hsk.xyz');
  const wallet = new ethers.Wallet(privateKey, provider);
  
  const kycAddress = '0x1525E262Cb5bDFC7b51802c36a1141bA94405F76';
  const userToVerify = '0xCd0B4044d6A477Aa69a040a3d866ee94D4511C1E';

  const kycAbi = [
    'function setLevel(address account, uint8 level) external',
    'function isHuman(address account) view returns (bool isValid, uint8 level)',
    'function owner() view returns (address)'
  ];

  const kyc = new ethers.Contract(kycAddress, kycAbi, wallet);

  console.log('Deployer:', wallet.address);
  console.log('KYC Contract:', kycAddress);
  console.log('User to verify:', userToVerify);

  const owner = await kyc.owner();
  console.log('KYC Owner:', owner);

  if (wallet.address.toLowerCase() !== owner.toLowerCase()) {
    console.error('❌ Wallet is not KYC contract owner. Cannot grant KYC.');
    console.log('You need to use the owner wallet or deploy your own KYC contract.');
    return;
  }

  console.log('\n📝 Setting KYC level 2 for user...');
  const tx = await kyc.setLevel(userToVerify, 2);
  console.log('TX:', tx.hash);
  await tx.wait();
  console.log('✅ KYC level 2 granted!');

  const [isValid, level] = await kyc.isHuman(userToVerify);
  console.log('\nNew status:', { isValid, level: Number(level) });
}

main().catch(console.error);

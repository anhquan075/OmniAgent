import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  const kycAddress = '0xba5d34A2BC3ccD44598971A5C56E8FfA6BB78525';
  const userToVerify = '0xCd0B4044d6A477Aa69a040a3d866ee94D4511C1E';
  
  const kyc = await ethers.getContractAt('SimpleKycSBT', kycAddress, deployer);
  
  console.log('Granting KYC level 2 to:', userToVerify);
  const tx = await kyc.setLevel(userToVerify, 2);
  await tx.wait();
  console.log('✅ KYC granted! TX:', tx.hash);
  
  const [isValid, level] = await kyc.isHuman(userToVerify);
  console.log('Status:', { isValid, level: Number(level) });
}

main().catch(console.error);

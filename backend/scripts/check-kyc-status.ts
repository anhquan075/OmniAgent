import { ethers } from 'ethers';

async function main() {
  const provider = new ethers.JsonRpcProvider('https://testnet.hsk.xyz');
  const kycAddress = '0x1525E262Cb5bDFC7b51802c36a1141bA94405F76';
  const userAddress = '0xCd0B4044d6A477Aa69a040a3d866ee94D4511C1E';

  const kycAbi = ['function isHuman(address account) view returns (bool isValid, uint8 level)'];

  const kyc = new ethers.Contract(kycAddress, kycAbi, provider);
  const [isValid, level] = await kyc.isHuman(userAddress);

  console.log(JSON.stringify({
    user: userAddress,
    kycValid: isValid,
    kycLevel: Number(level),
    requiredLevel: 2,
    canDeposit: isValid && level >= 2
  }, null, 2));
}

main();

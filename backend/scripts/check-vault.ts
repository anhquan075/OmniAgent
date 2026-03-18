const { ethers } = require('hardhat');

async function main() {
  const vaultAddress = '0xcB411a907e47047da98B38C99A683c6FAF2AA87A';
  const abi = ['function configurationLocked() view returns (bool)'];
  const vault = new ethers.Contract(vaultAddress, abi, ethers.provider);
  const locked = await vault.configurationLocked();
  console.log('Vault locked:', locked);
}

main().catch(console.error);

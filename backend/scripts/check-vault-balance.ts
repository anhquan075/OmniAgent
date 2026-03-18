const { ethers } = require('hardhat');

async function main() {
  const vaultAddress = '0xcB411a907e47047da98B38C99A683c6FAF2AA87A';
  const userAddress = '0xA4c009f0541d9C7f86F12cF4470Faf60448B240B';
  
  const vaultAbi = ['function balanceOf(address account) view returns (uint256)'];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, ethers.provider);
  
  const balance = await vault.balanceOf(userAddress);
  console.log('User vault balance (shares):', balance.toString());
  
  const totalAssets = await vault.totalAssets();
  console.log('Vault total assets:', totalAssets.toString());
}

main().catch(console.error);

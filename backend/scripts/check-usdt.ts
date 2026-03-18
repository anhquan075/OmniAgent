const { ethers } = require('hardhat');

async function main() {
  const usdtAddress = '0xdea54eC5150Aa35ef2686b02EdD20b050430Ad7D';
  const vaultAddress = '0xcB411a907e47047da98B38C99A683c6FAF2AA87A';
  const userAddress = '0xA4c009f0541d9C7f86F12cF4470Faf60448B240B';
  
  const usdtAbi = ['function allowance(address owner, address spender) view returns (uint256)'];
  const usdt = new ethers.Contract(usdtAddress, usdtAbi, ethers.provider);
  
  const allowance = await usdt.allowance(userAddress, vaultAddress);
  console.log('USDT allowance for vault:', allowance.toString());
  
  const userBalance = await usdt.balanceOf(userAddress);
  console.log('User USDT balance:', userBalance.toString());
}

main().catch(console.error);

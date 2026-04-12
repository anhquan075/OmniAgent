import { ethers } from 'ethers';

async function main() {
  const provider = new ethers.JsonRpcProvider('https://testnet.hsk.xyz');
  const usdt = new ethers.Contract(
    '0xA3eb6Cb28659ec53388FE5Ff3E64920e3C274038',
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );
  
  const deployer = '0xB789D888A53D34f6701C1A5876101Cb32dbF17cF';
  const balance = await usdt.balanceOf(deployer);
  const hskBalance = await provider.getBalance(deployer);
  
  console.log('Deployer:', deployer);
  console.log('USDT Balance:', ethers.formatUnits(balance, 6));
  console.log('HSK Balance:', ethers.formatEther(hskBalance));
}

main();

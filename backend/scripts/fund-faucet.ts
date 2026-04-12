import { ethers } from 'hardhat';

const USDT_ADDRESS = '0xA3eb6Cb28659ec53388FE5Ff3E64920e3C274038';
const NEW_FAUCET_ADDRESS = '0xAAbBF69b661a3d327dE386CEF65a4214566591a7';
const FUND_AMOUNT = 50n * 10n ** 6n; // 50 USDT

async function main() {
  const [user] = await ethers.getSigners();
  
  console.log('=== Check USDT Balance ===');
  console.log('Your address:', user.address);
  
  const usdt = await ethers.getContractAt(
    ['function balanceOf(address) view returns (uint256)'],
    USDT_ADDRESS,
    user
  );
  
  const balance = await usdt.balanceOf(user.address);
  console.log('Your USDT balance:', ethers.formatUnits(balance, 6));
  
  if (balance < FUND_AMOUNT) {
    console.log('\n❌ Not enough USDT to fund faucet');
    console.log('Need:', ethers.formatUnits(FUND_AMOUNT, 6), 'USDT');
    console.log('You need more USDT on HashKey testnet');
    return;
  }
  
  console.log('\n=== Funding New Faucet ===');
  console.log('Faucet:', NEW_FAUCET_ADDRESS);
  console.log('Amount:', ethers.formatUnits(FUND_AMOUNT, 6), 'USDT');
  
  const tx = await usdt.transfer(NEW_FAUCET_ADDRESS, FUND_AMOUNT);
  await tx.wait();
  
  console.log('✅ USDT transferred!');
  
  const faucetBalance = await usdt.balanceOf(NEW_FAUCET_ADDRESS);
  console.log('\n=== New Faucet Balance ===');
  console.log('USDT:', ethers.formatUnits(faucetBalance, 6));
}

main().catch(console.error);
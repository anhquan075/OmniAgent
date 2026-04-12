import { ethers } from 'hardhat';

const USDT_ADDRESS = '0xA3eb6Cb28659ec53388FE5Ff3E64920e3C274038';
const HSK_FOR_FAUCET = ethers.parseEther('0.001');

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log('Deploying Faucet...');
  console.log('Deployer:', deployer.address);
  
  const Faucet = await ethers.getContractFactory('TestnetFaucet');
  const faucet = await Faucet.deploy(USDT_ADDRESS, { value: HSK_FOR_FAUCET });
  await faucet.waitForDeployment();
  const faucetAddress = await faucet.getAddress();
  
  console.log('✅ Faucet deployed:', faucetAddress);
  console.log('📝 Funded with', ethers.formatEther(HSK_FOR_FAUCET), 'HSK');
  
  console.log('\n💰 Transferring 700 USDT to faucet...');
  const usdt = await ethers.getContractAt(
    ['function transfer(address to, uint256 amount) returns (bool)', 'function balanceOf(address) view returns (uint256)'],
    USDT_ADDRESS,
    deployer
  );
  
  const usdtAmount = 700n * 10n ** 6n;
  const tx = await usdt.transfer(faucetAddress, usdtAmount);
  await tx.wait();
  console.log('✅ USDT transferred!');
  
  const faucetBalance = await usdt.balanceOf(faucetAddress);
  console.log('\n📊 Faucet Balances:');
  console.log('USDT:', ethers.formatUnits(faucetBalance, 6));
  console.log('HSK:', ethers.formatEther(await ethers.provider.getBalance(faucetAddress)));
  console.log('Can serve:', Number(faucetBalance / (50n * 10n ** 6n)), 'users');
  
  console.log('\n📝 Add to .env:');
  console.log(`HASHKEY_FAUCET_ADDRESS=${faucetAddress}`);
  
  console.log('\n🔗 Explorer:');
  console.log(`https://testnet-explorer.hsk.xyz/address/${faucetAddress}`);
}

main().catch(console.error);

import { ethers } from 'hardhat';

const SEPOLIA_USDT = '0xd077a400968890eacc75cdc901f0356c943e4fdb';
const HSK_FOR_FAUCET = ethers.parseEther('0.01');

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  
  console.log('Deploying Sepolia Faucet...');
  console.log('Deployer:', deployer.address);
  console.log('Network:', network.name, `(${network.chainId})`);
  
  const Faucet = await ethers.getContractFactory('TestnetFaucet');
  const faucet = await Faucet.deploy(SEPOLIA_USDT, { value: HSK_FOR_FAUCET });
  await faucet.waitForDeployment();
  const faucetAddress = await faucet.getAddress();
  
  console.log('✅ Faucet deployed:', faucetAddress);
  console.log('📝 Funded with', ethers.formatEther(HSK_FOR_FAUCET), 'ETH');
  
  const deployer_balance = await ethers.provider.getBalance(deployer.address);
  const usdt = await ethers.getContractAt(
    ['function transfer(address to, uint256 amount) returns (bool)', 'function balanceOf(address) view returns (uint256)'],
    SEPOLIA_USDT,
    deployer
  );
  
  const deployer_usdt = await usdt.balanceOf(deployer.address);
  console.log('\n📊 Deployer Balances:');
  console.log('USDT:', ethers.formatUnits(deployer_usdt, 6));
  console.log('ETH:', ethers.formatEther(deployer_balance));
  
  if (deployer_usdt >= 700n * 10n ** 6n) {
    console.log('\n💰 Transferring 700 USDT to faucet...');
    const tx = await usdt.transfer(faucetAddress, 700n * 10n ** 6n);
    await tx.wait();
    console.log('✅ USDT transferred!');
  } else {
    console.log('\n⚠️  Not enough USDT. Please fund deployer first.');
  }
  
  const faucetBalance = await usdt.balanceOf(faucetAddress);
  console.log('\n📊 Faucet Balances:');
  console.log('USDT:', ethers.formatUnits(faucetBalance, 6));
  console.log('ETH:', ethers.formatEther(await ethers.provider.getBalance(faucetAddress)));
  console.log('Can serve:', Number(faucetBalance / (1000n * 10n ** 6n)), 'users');
  
  console.log('\n📝 Add to .env:');
  console.log(`SEPOLIA_FAUCET_ADDRESS=${faucetAddress}`);
  
  console.log('\n🔗 Explorer:');
  console.log(`https://sepolia.etherscan.io/address/${faucetAddress}`);
}

main().catch(console.error);

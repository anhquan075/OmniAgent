import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load only .env (not .env.wdk.local)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  console.log("\n========================================");
  console.log("   SEEDING VAULT WITH USDT");
  console.log("========================================\n");

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Network: ${(await ethers.provider.getNetwork()).name}\n`);

  // Get addresses from .env
  const usdtAddr = process.env.WDK_USDT_ADDRESS;
  const vaultAddr = process.env.WDK_VAULT_ADDRESS;

  if (!usdtAddr || !vaultAddr) {
    throw new Error("Missing WDK_USDT_ADDRESS or WDK_VAULT_ADDRESS in .env");
  }

  console.log(`USDT Address: ${usdtAddr}`);
  console.log(`Vault Address: ${vaultAddr}\n`);

  // Get contract instances
  const usdt = await ethers.getContractAt('MockERC20', usdtAddr);
  const vault = await ethers.getContractAt('WDKVault', vaultAddr);

  // Check current state
  console.log("--- Current State ---");
  const currentTotalAssets = await vault.totalAssets();
  const currentUsdtBalance = await usdt.balanceOf(vaultAddr);
  console.log(`Vault Total Assets: ${ethers.formatUnits(currentTotalAssets, 6)} USDT`);
  console.log(`Vault USDT Balance: ${ethers.formatUnits(currentUsdtBalance, 6)} USDT\n`);

  // Mint 100,000 USDT to deployer
  const mintAmount = ethers.parseUnits("100000", 6);
  console.log("--- Minting USDT ---");
  console.log(`Minting ${ethers.formatUnits(mintAmount, 6)} USDT to deployer...`);
  const mintTx = await usdt.mint(deployer.address, mintAmount);
  await mintTx.wait();
  console.log("✅ Minted successfully\n");

  // Check deployer balance
  const deployerBalance = await usdt.balanceOf(deployer.address);
  console.log(`Deployer USDT Balance: ${ethers.formatUnits(deployerBalance, 6)} USDT\n`);

  // Approve vault to spend USDT
  console.log("--- Approving Vault ---");
  console.log(`Approving vault to spend ${ethers.formatUnits(mintAmount, 6)} USDT...`);
  const approveTx = await usdt.approve(vaultAddr, mintAmount);
  await approveTx.wait();
  console.log("✅ Approved successfully\n");

  // Deposit into vault
  console.log("--- Depositing to Vault ---");
  console.log(`Depositing ${ethers.formatUnits(mintAmount, 6)} USDT into vault...`);
  const depositTx = await vault.deposit(mintAmount, deployer.address);
  const receipt = await depositTx.wait();
  console.log("✅ Deposited successfully");
  console.log(`Transaction: ${receipt?.hash}\n`);

  // Verify final state
  console.log("--- Final State ---");
  const finalTotalAssets = await vault.totalAssets();
  const finalUsdtBalance = await usdt.balanceOf(vaultAddr);
  const deployerShares = await vault.balanceOf(deployer.address);
  
  console.log(`Vault Total Assets: ${ethers.formatUnits(finalTotalAssets, 6)} USDT`);
  console.log(`Vault USDT Balance: ${ethers.formatUnits(finalUsdtBalance, 6)} USDT`);
  console.log(`Deployer Shares: ${ethers.formatUnits(deployerShares, 18)}`);

  console.log("\n========================================");
  console.log("   ✅ VAULT SEEDED SUCCESSFULLY");
  console.log("========================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Error:", error);
    process.exit(1);
  });

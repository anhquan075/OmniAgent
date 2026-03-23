import { ethers } from "hardhat";

const HASHKEY_CHAIN_ID = 133;
const HASHKEY_RPC = "https://testnet.hsk.xyz";
const HASHKEY_EXPLORER = "https://testnet-explorer.hsk.xyz";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying to HashKey testnet (chain ${HASHKEY_CHAIN_ID})...`);
  console.log(`Deployer: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  console.log("\n1. Deploying MockKycSBT...");
  const MockKycSBT = await ethers.getContractFactory("MockKycSBT");
  const kycSBT = await MockKycSBT.deploy();
  await kycSBT.waitForDeployment();
  const kycAddress = await kycSBT.getAddress();
  console.log(`   MockKycSBT: ${kycAddress}`);
  console.log(`   Explorer: ${HASHKEY_EXPLORER}/address/${kycAddress}`);

  console.log("\n2. Deploying MockERC20 (USDT)...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdt = await MockERC20.deploy("Tether USD", "USDT");
  await usdt.waitForDeployment();
  const usdtAddress = await usdt.getAddress();
  await (await usdt.setDecimals(6)).wait();
  console.log(`   MockUSDT: ${usdtAddress}`);
  console.log(`   Explorer: ${HASHKEY_EXPLORER}/address/${usdtAddress}`);

  console.log("\n3. Deploying HashKeyVault...");
  const HashKeyVault = await ethers.getContractFactory("HashKeyVault");
  const vault = await HashKeyVault.deploy(usdtAddress, kycAddress, deployer.address);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`   HashKeyVault: ${vaultAddress}`);
  console.log(`   Explorer: ${HASHKEY_EXPLORER}/address/${vaultAddress}`);

  console.log("\n4. Whitelisting deployer KYC level 3 (ADVANCED)...");
  await (await kycSBT.setKyc(deployer.address, true, 3)).wait();
  console.log("   Done.");

  console.log("\n5. Minting 1000 USDT to deployer...");
  const mintAmount = ethers.parseUnits("1000", 6);
  await (await usdt.mint(deployer.address, mintAmount)).wait();
  const deployerUsdtBal = await usdt.balanceOf(deployer.address);
  console.log(`   Deployer USDT balance: ${ethers.formatUnits(deployerUsdtBal, 6)}`);

  console.log("\n=== Deployment Summary ===");
  console.log(`HASHKEY_CHAIN_ID=${HASHKEY_CHAIN_ID}`);
  console.log(`HASHKEY_RPC_URL=${HASHKEY_RPC}`);
  console.log(`HASHKEY_EXPLORER_URL=${HASHKEY_EXPLORER}`);
  console.log(`HASHKEY_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`HASHKEY_USDT_ADDRESS=${usdtAddress}`);
  console.log(`HASHKEY_KYC_SBT_ADDRESS=${kycAddress}`);
  console.log(`HASHKEY_SAFE_ADDRESS=`);
  console.log("\nNext: Update backend/.env with these addresses and run:");
  console.log(`npx hardhat run scripts/deploy-hashkey.ts --network hashkey`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

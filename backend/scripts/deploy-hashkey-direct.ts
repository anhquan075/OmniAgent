// Direct deployment script for HashKey testnet
// Bypasses hardhat config by using ethers directly
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { ethers } = require("hardhat");

const HASHKEY_CHAIN_ID = 133;
const HASHKEY_RPC = "https://testnet.hsk.xyz";
const HASHKEY_EXPLORER = "https://testnet-explorer.hsk.xyz";

// Use the Hardhat default account #1 which has HSK on HashKey testnet
// Alternative: use PRIVATE_KEY from env
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  const provider = new ethers.JsonRpcProvider(HASHKEY_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  console.log(`Deploying to HashKey testnet (chain ${HASHKEY_CHAIN_ID})...`);
  console.log(`Deployer: ${wallet.address}`);
  
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} HSK`);

  console.log("\n1. Deploying MockKycSBT...");
  const MockKycSBT = await ethers.getContractFactory("MockKycSBT");
  const kycSBT = await MockKycSBT.connect(wallet).deploy();
  await kycSBT.waitForDeployment();
  const kycAddress = await kycSBT.getAddress();
  console.log(`   MockKycSBT: ${kycAddress}`);
  console.log(`   Explorer: ${HASHKEY_EXPLORER}/address/${kycAddress}`);

  console.log("\n2. Deploying MockERC20 (USDT)...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdt = await MockERC20.connect(wallet).deploy("Tether USD", "USDT");
  await usdt.waitForDeployment();
  const usdtAddress = await usdt.getAddress();
  await (await usdt.connect(wallet).setDecimals(6)).wait();
  console.log(`   MockUSDT: ${usdtAddress}`);
  console.log(`   Explorer: ${HASHKEY_EXPLORER}/address/${usdtAddress}`);

  console.log("\n3. Deploying HashKeyVault...");
  const HashKeyVault = await ethers.getContractFactory("HashKeyVault");
  const vault = await HashKeyVault.connect(wallet).deploy(usdtAddress, kycAddress, wallet.address);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`   HashKeyVault: ${vaultAddress}`);
  console.log(`   Explorer: ${HASHKEY_EXPLORER}/address/${vaultAddress}`);

  console.log("\n4. Whitelisting deployer KYC level 3 (ADVANCED)...");
  await (await kycSBT.connect(wallet).setKyc(wallet.address, true, 3)).wait();
  console.log("   Done.");

  console.log("\n5. Minting 1000 USDT to deployer...");
  const mintAmount = ethers.parseUnits("1000", 6);
  await (await usdt.connect(wallet).mint(wallet.address, mintAmount)).wait();
  const deployerUsdtBal = await usdt.balanceOf(wallet.address);
  console.log(`   Deployer USDT balance: ${ethers.formatUnits(deployerUsdtBal, 6)}`);

  // Also set KYC for agent wallet if different from deployer
  const agentWallet = process.env.AGENT_WALLET || "0xA4c009f0541d9C7f86F12cF4470Faf60448B240B";
  if (agentWallet.toLowerCase() !== wallet.address.toLowerCase()) {
    console.log("\n6. Setting KYC level 3 for agent wallet...");
    await (await kycSBT.connect(wallet).setKyc(agentWallet, true, 3)).wait();
    console.log(`   Agent KYC set for: ${agentWallet}`);
    console.log("\n7. Minting 1000 USDT to agent wallet...");
    await (await usdt.connect(wallet).mint(agentWallet, mintAmount)).wait();
    console.log(`   Agent USDT balance: ${ethers.formatUnits(await usdt.balanceOf(agentWallet), 6)}`);
  }

  console.log("\n=== Deployment Summary ===");
  console.log(`HASHKEY_CHAIN_ID=${HASHKEY_CHAIN_ID}`);
  console.log(`HASHKEY_RPC_URL=${HASHKEY_RPC}`);
  console.log(`HASHKEY_EXPLORER_URL=${HASHKEY_EXPLORER}`);
  console.log(`HASHKEY_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`HASHKEY_USDT_ADDRESS=${usdtAddress}`);
  console.log(`HASHKEY_KYC_SBT_ADDRESS=${kycAddress}`);
  console.log(`HASHKEY_SAFE_ADDRESS=`);
  console.log(`AGENT_WALLET=${agentWallet}`);
  console.log("\nUpdate backend/.env with these addresses.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

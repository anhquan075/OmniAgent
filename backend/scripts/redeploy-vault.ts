require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

async function main() {
  const { ethers } = require("hardhat");
  const provider = new ethers.JsonRpcProvider(process.env.HASHKEY_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const HASHKEY_EXPLORER = "https://testnet-explorer.hsk.xyz";

  const USDT = process.env.HASHKEY_USDT_ADDRESS;
  const KYC = process.env.HASHKEY_KYC_SBT_ADDRESS;

  console.log("Deploying HashKeyVault with debug events...");
  const HashKeyVault = await ethers.getContractFactory("HashKeyVault");
  const vault = await HashKeyVault.connect(wallet).deploy(USDT, KYC, wallet.address);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("New HashKeyVault:", vaultAddr);
  console.log("Explorer:", HASHKEY_EXPLORER + "/address/" + vaultAddr);

  // Set KYC for deployer
  const kyc = await ethers.getContractAt("MockKycSBT", KYC, wallet);
  await (await kyc.setKyc(wallet.address, true, 3)).wait();
  console.log("KYC set for:", wallet.address);

  // Get USDT balance and mint if needed
  const token = await ethers.getContractAt("MockERC20", USDT, wallet);
  const bal = await token.balanceOf(wallet.address);
  console.log("USDT balance:", ethers.formatUnits(bal, 6));

  if (bal < 100000000n) {
    await (await token.mint(wallet.address, ethers.parseUnits("1000", 6))).wait();
    console.log("Minted 1000 USDT");
  }

  // Approve vault
  await (await token.approve(vaultAddr, ethers.parseUnits("1000", 6))).wait();
  console.log("Approved vault");

  // Test deposit
  console.log("\nTesting deposit...");
  try {
    const gas = await vault.deposit.estimateGas(ethers.parseUnits("100", 6), wallet.address);
    console.log("estimateGas:", gas.toString());
    const tx = await vault.deposit(ethers.parseUnits("100", 6), wallet.address);
    const receipt = await tx.wait();
    console.log("Deposit SUCCESS! Tx:", receipt.hash);
    const events = receipt.logs.filter(l => l.fragment?.name === "DebugEvent" || l.fragment?.name === "DebugTotalAssets");
    events.forEach(e => console.log("Event:", e.fragment.name, e.args));
  } catch (e) {
    console.log("FAILED:", e.message.slice(0, 500));
  }
}

main().catch(err => { console.error(err); process.exit(1); });

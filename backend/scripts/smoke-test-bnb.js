
const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  console.log("🚀 Starting BNB Testnet Smoke Test...");

  const rpcUrl = process.env.BNB_TESTNET_RPC_URL || "https://bsc-testnet-dataseed.bnbchain.org";
  const privateKey = process.env.PRIVATE_KEY;
  const vaultAddr = process.env.WDK_VAULT_ADDRESS;
  const engineAddr = process.env.WDK_ENGINE_ADDRESS;
  const usdtAddr = process.env.WDK_USDT_ADDRESS;

  if (!privateKey || !vaultAddr || !engineAddr || !usdtAddr) {
    console.error("❌ Missing environment variables. Check .env");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`📡 Connected to BNB Testnet via ${rpcUrl}`);
  console.log(`🔑 Agent Wallet: ${wallet.address}`);

  const bnbBalance = await provider.getBalance(wallet.address);
  console.log(`💰 Agent BNB Balance: ${ethers.formatEther(bnbBalance)} BNB`);

  const usdtAbi = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];
  const usdtContract = new ethers.Contract(usdtAddr, usdtAbi, provider);
  try {
    const usdtBal = await usdtContract.balanceOf(wallet.address);
    console.log(`💵 Agent USDT Balance: ${ethers.formatUnits(usdtBal, 18)} USDT (assuming 18 decimals)`);
  } catch (e) {
    console.error("⚠️  Failed to fetch USDT balance:", e.message);
  }

  const vaultAbi = ["function totalAssets() view returns (uint256)", "function asset() view returns (address)"];
  const vaultContract = new ethers.Contract(vaultAddr, vaultAbi, provider);
  try {
    const totalAssets = await vaultContract.totalAssets();
    const asset = await vaultContract.asset();
    console.log(`🏦 Vault Asset: ${asset}`);
    console.log(`📈 Vault Total Assets: ${ethers.formatUnits(totalAssets, 18)}`);
  } catch (e) {
    console.error("⚠️  Failed to fetch Vault data:", e.message);
  }

  const engineAbi = [
    "function canExecute() view returns (bool, bytes32)",
    "function previewDecision() view returns (tuple(bool executable, bytes32 reason, uint8 nextState, uint256 price, uint256 previousPrice, uint256 volatilityBps, uint256 targetWDKBps, uint256 targetLpBps, uint256 bountyBps, bool breakerPaused, int256 meanYieldBps, uint256 yieldVolatilityBps, int256 sharpeRatio, uint256 auctionElapsedSeconds, uint256 bufferUtilizationBps))"
  ];
  const engineContract = new ethers.Contract(engineAddr, engineAbi, provider);

  try {
    const [executable, reason] = await engineContract.canExecute();
    console.log(`⚙️  Engine Executable: ${executable} (Reason: ${reason})`);

    const preview = await engineContract.previewDecision();
    const stateNames = ["Normal", "Guarded", "Drawdown"];
    console.log(`🔍 Engine Preview:`);
    console.log(`   - Current Price: $${ethers.formatUnits(preview.price, 8)}`);
    console.log(`   - Predicted State: ${stateNames[Number(preview.nextState)]} (${preview.nextState})`);
    console.log(`   - Target Allocation: ${preview.targetWDKBps} bps`);
  } catch (e) {
    console.error("⚠️  Failed to fetch Engine data:", e.message);
  }

  console.log("\n✅ Smoke Test Completed.");
}

main().catch(console.error);

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🚀 Starting Full Stack Deployment with Seed Data...");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Deployer:", deployer.address);

  // 1. Deploy Mock Assets
  console.log("\n--- Phase 1: Mock Assets ---");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdt = await (await MockERC20.deploy("Tether USD", "USDT")).waitForDeployment();
  await (await usdt.setDecimals(6)).wait();
  const usdtAddr = await usdt.getAddress();
  console.log("USDT (6 dec):", usdtAddr);

  const xaut = await (await MockERC20.deploy("Tether Gold", "XAUT")).waitForDeployment();
  await (await xaut.setDecimals(4)).wait();
  const xautAddr = await xaut.getAddress();
  console.log("XAUT (4 dec):", xautAddr);

  // 2. Deploy Mock Oracles
  console.log("\n--- Phase 2: Oracles ---");
  const MockChainlink = await ethers.getContractFactory("MockChainlinkAggregator");
  const usdtChainlink = await (await MockChainlink.deploy(8, ethers.parseUnits("1", 8))).waitForDeployment();
  const xautChainlink = await (await MockChainlink.deploy(8, ethers.parseUnits("2000", 8))).waitForDeployment();
  
  const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
  const usdtOracle = await (await MockPriceOracle.deploy(ethers.parseUnits("1", 8), deployer.address)).waitForDeployment();
  const xautOracle = await (await MockPriceOracle.deploy(ethers.parseUnits("2000", 8), deployer.address)).waitForDeployment();
  const usdtOracleAddr = await usdtOracle.getAddress();
  const xautOracleAddr = await xautOracle.getAddress();
  console.log("USDT Oracle:", usdtOracleAddr);
  console.log("XAUT Oracle:", xautOracleAddr);

  // 3. Deploy Core Stack
  console.log("\n--- Phase 3: Core Stack ---");
  const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
  const policy = await (await RiskPolicy.deploy(
    300, 150, 500, ethers.parseUnits("0.97", 8), 100, 100, 1000, 5000, 10000, 5, 3600, 500, 20, 1500, 0, 0, 0
  )).waitForDeployment();
  console.log("RiskPolicy:", await policy.getAddress());
  
  const SharpeTracker = await ethers.getContractFactory("SharpeTracker");
  const sharpeTracker = await (await SharpeTracker.deploy(20)).waitForDeployment();
  console.log("SharpeTracker:", await sharpeTracker.getAddress());

  const MockStableSwap = await ethers.getContractFactory("MockStableSwapPoolWithLPSupport");
  const pool = await (await MockStableSwap.deploy(
    usdtAddr, xautAddr, ethers.parseUnits("1000000", 18), ethers.parseUnits("1000000", 18), ethers.parseUnits("1", 18), 0
  )).waitForDeployment();
  console.log("Mock StableSwap Pool:", await pool.getAddress());

  const CircuitBreaker = await ethers.getContractFactory("CircuitBreaker");
  const breaker = await (await CircuitBreaker.deploy(
    await usdtChainlink.getAddress(), await pool.getAddress(), 50, 100, 50, 3600, 999999999
  )).waitForDeployment();
  console.log("CircuitBreaker:", await breaker.getAddress());

  const WDKVault = await ethers.getContractFactory("WDKVault");
  const vault = await (await WDKVault.deploy(usdtAddr, "OmniWDK WDK Vault", "TPWDK", deployer.address, 500)).waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("WDKVault:", vaultAddr);

  const StrategyEngine = await ethers.getContractFactory("StrategyEngine");
  const engine = await (await StrategyEngine.deploy(
    vaultAddr, await policy.getAddress(), usdtOracleAddr, await breaker.getAddress(), await sharpeTracker.getAddress(), ethers.parseUnits("1", 8)
  )).waitForDeployment();
  const engineAddr = await engine.getAddress();
  console.log("StrategyEngine:", engineAddr);

  // 4. Deploy Adapters
  console.log("\n--- Phase 4: Adapters ---");
  const XAUTYieldAdapter = await ethers.getContractFactory("XAUTYieldAdapter");
  const xautAdapter = await (await XAUTYieldAdapter.deploy(usdtAddr, xautAddr, xautOracleAddr, usdtOracleAddr, deployer.address)).waitForDeployment();
  const xautAdapterAddr = await xautAdapter.getAddress();
  console.log("XAUT Adapter:", xautAdapterAddr);

  const ManagedAdapter = await ethers.getContractFactory("ManagedAdapter");
  const secondaryAdapter = await (await ManagedAdapter.deploy(usdtAddr, deployer.address)).waitForDeployment();
  const lpAdapter = await (await ManagedAdapter.deploy(usdtAddr, deployer.address)).waitForDeployment();
  console.log("Secondary Adapter:", await secondaryAdapter.getAddress());
  console.log("LP Adapter:", await lpAdapter.getAddress());

  // 5. Wiring & Locking
  console.log("\n--- Phase 5: Wiring ---");
  await (await sharpeTracker.setEngine(engineAddr)).wait();
  await (await vault.setEngine(engineAddr)).wait();
  await (await vault.setAdapters(xautAdapterAddr, await secondaryAdapter.getAddress(), await lpAdapter.getAddress())).wait();
  await (await xautAdapter.setVault(vaultAddr)).wait();
  await (await secondaryAdapter.setVault(vaultAddr)).wait();
  await (await lpAdapter.setVault(vaultAddr)).wait();
  console.log("Wiring complete.");

  console.log("Locking configurations...");
  await (await xautAdapter.lockConfiguration()).wait();
  await (await secondaryAdapter.lockConfiguration()).wait();
  await (await lpAdapter.lockConfiguration()).wait();
  await (await vault.lockConfiguration()).wait();
  console.log("Configurations locked.");

  const currentEngine = await vault.engine();
  console.log("Vault Engine set to:", currentEngine);
  if (currentEngine === ethers.ZeroAddress) {
    throw new Error("Failed to set Vault Engine!");
  }

  // 6. Seed Data (Big Data Simulation)
  console.log("\n--- Phase 6: Seeding Data ---");
  const userCount = 10;
  const seedAmount = ethers.parseUnits("10000", 6);
  console.log(`Minting ${ethers.formatUnits(seedAmount * BigInt(userCount), 6)} USDT to ${userCount} test users and depositing...`);
  
  for (let i = 0; i < userCount; i++) {
    const tempWallet = ethers.Wallet.createRandom().connect(ethers.provider);
    const gasTx = await deployer.sendTransaction({ to: tempWallet.address, value: ethers.parseEther("0.1") });
    await gasTx.wait();

    await (await usdt.mint(tempWallet.address, seedAmount)).wait();
    await (await usdt.connect(tempWallet).approve(vaultAddr, seedAmount)).wait();
    
    console.log(`  - Depositing for User ${i+1}: ${tempWallet.address}`);
    const depTx = await vault.connect(tempWallet).deposit(seedAmount, tempWallet.address);
    await depTx.wait();
    console.log(`  - Seeded User ${i+1} success.`);
  }

  // Seed XAUT Adapter for value reporting
  await (await xaut.mint(xautAdapterAddr, ethers.parseUnits("10", 4))).wait();
  console.log("Seeded XAUT Adapter with 10.0 oz Gold");

  // 7. Output Environment Variables
  console.log("\n========================================");
  console.log("   DEPLOYMENT COMPLETE");
  console.log("========================================");
  const envContent = `
WDK_VAULT_ADDRESS=${vaultAddr}
WDK_ENGINE_ADDRESS=${engineAddr}
WDK_USDT_ADDRESS=${usdtAddr}
WDK_XAUT_ADDRESS=${xautAddr}
WDK_ZK_ORACLE_ADDRESS=${usdtOracleAddr}
WDK_BREAKER_ADDRESS=${await breaker.getAddress()}
`;
  console.log(envContent);
  fs.writeFileSync(path.join(process.cwd(), '.env.wdk.local'), envContent);
  console.log("Environment variables saved to .env.wdk.local");
}

main().catch(console.error);

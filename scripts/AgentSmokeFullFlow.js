const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("=".repeat(60));
  console.log("  Agent Smoke Test — Full Flow (In-Process Fork)");
  console.log("=".repeat(60));

  const [deployer] = await ethers.getSigners();
  console.log("\nDeployer:", deployer.address);

  const rpcUrl = process.env.BNB_ARCHIVE_RPC_URL || process.env.BNB_MAINNET_RPC_URL || "https://bsc-dataseed.bnbchain.org";
  
  // 1. Get latest block and reset fork
  const mainnetProvider = new ethers.JsonRpcProvider(rpcUrl);
  const latestBlock = await mainnetProvider.getBlockNumber();
  const forkBlock = latestBlock - 50;
  console.log(`Resetting fork to block ${forkBlock} using ${rpcUrl}...`);

  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: rpcUrl, blockNumber: forkBlock } }],
  });
  console.log("Fork reset successful.");

  // 2. Deploy full stack (simplified deployment for smoke test)
  const USDT_ADDR = "0x55d398326f99059fF775485246999027B3197955";
  const CHAINLINK_FEED = "0xB97Ad0E74fa7d920791E90258A6E2085088b4320";

  const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
  const policy = await (await RiskPolicy.deploy(300, 150, 500, ethers.parseUnits("0.97", 8), 100, 100, 2000, 5000, 7000, 5, 3600, 500, 20, 5000, 2000, 1500, 500)).waitForDeployment();
  
  const Oracle = await ethers.getContractFactory("ChainlinkPriceOracle");
  const oracle = await (await Oracle.deploy(CHAINLINK_FEED, 259200)).waitForDeployment();

  const MockSSPool = await ethers.getContractFactory("MockStableSwapPool");
  const mockPool = await (await MockSSPool.deploy(USDT_ADDR, ethers.ZeroAddress, ethers.parseUnits("10M", 18), ethers.parseUnits("10M", 18), ethers.parseUnits("1", 18), 4)).waitForDeployment();

  const CB = await ethers.getContractFactory("CircuitBreaker");
  const breaker = await (await CB.deploy(CHAINLINK_FEED, await mockPool.getAddress(), 50, 100, 50, 3600, 259200)).waitForDeployment();

  const Sharpe = await ethers.getContractFactory("SharpeTracker");
  const sharpeTracker = await (await Sharpe.deploy(20)).waitForDeployment();

  const MockAdapter = await ethers.getContractFactory("MockAsterEarnAdapter");
  const asterAdapter = await (await MockAdapter.deploy(USDT_ADDR, deployer.address)).waitForDeployment();

  const Vault = await ethers.getContractFactory("ProofVault");
  const vault = await (await Vault.deploy(USDT_ADDR, "Agent Smoke Vault", "ASV", deployer.address, 500)).waitForDeployment();
  const vaultAddr = await vault.getAddress();

  const Engine = await ethers.getContractFactory("StrategyEngine");
  const engine = await (await Engine.deploy(vaultAddr, await policy.getAddress(), await oracle.getAddress(), await breaker.getAddress(), await sharpeTracker.getAddress(), ethers.parseUnits("1", 8))).waitForDeployment();
  const engineAddr = await engine.getAddress();

  await (await sharpeTracker.setEngine(engineAddr)).wait();
  await (await vault.setEngine(engineAddr)).wait();
  await (await asterAdapter.setVault(vaultAddr)).wait();
  await (await vault.setAdapters(await asterAdapter.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress)).wait();

  console.log(`\nStack Deployed:`);
  console.log(`  Vault: ${vaultAddr}`);
  console.log(`  Engine: ${engineAddr}`);

  // 3. Update .env.wdk for the agent
  const envPath = ".env.wdk";
  if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, "utf8");
    content = content.replace(/WDK_VAULT_ADDRESS=.*/, `WDK_VAULT_ADDRESS=${vaultAddr}`);
    content = content.replace(/WDK_ENGINE_ADDRESS=.*/, `WDK_ENGINE_ADDRESS=${engineAddr}`);
    content = content.replace(/WDK_BREAKER_ADDRESS=.*/, `WDK_BREAKER_ADDRESS=${await breaker.getAddress()}`);
    content = content.replace(/WDK_USDT_ADDRESS=.*/, `WDK_USDT_ADDRESS=${USDT_ADDR}`);
    content = content.replace(/WDK_ZK_ORACLE_ADDRESS=.*/, `WDK_ZK_ORACLE_ADDRESS=${await oracle.getAddress()}`);
    // Point agent to the local hardhat node's provider if it's not already
    // But since we are in-process, loop.js's ethers.JsonRpcProvider(bnbRpc) won't see the in-process network easily.
    // We'll need to run the agent separately OR use a workaround.
    fs.writeFileSync(envPath, content);
    console.log(`  ✓ Updated ${envPath}`);
  }

  // 4. Seed some USDT to a whale and deposit (like in ForkTestMainnet)
  const WHALE = "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3";
  await ethers.provider.send("hardhat_impersonateAccount", [WHALE]);
  const whale = await ethers.getSigner(WHALE);
  await ethers.provider.send("hardhat_setBalance", [WHALE, "0x" + (2n * 10n ** 18n).toString(16)]);
  const usdtContract = new ethers.Contract(USDT_ADDR, ["function transfer(address,uint256) returns (bool)", "function approve(address,uint256) returns (bool)"], whale);
  await (await usdtContract.transfer(deployer.address, ethers.parseUnits("50000", 18))).wait();
  await ethers.provider.send("hardhat_stopImpersonatingAccount", [WHALE]);
  
  const usdtDeployer = new ethers.Contract(USDT_ADDR, ["function approve(address,uint256) returns (bool)"], deployer);
  await (await usdtDeployer.approve(vaultAddr, ethers.MaxUint256)).wait();
  await (await vault.deposit(ethers.parseUnits("10000", 18), deployer.address)).wait();
  console.log("  ✓ Deposited 10,000 USDT into vault.");

  // 5. Run the agent cycle
  console.log("\n── Running Agent Autonomous Cycle ──────────────────────────");
  
  // We need to run the agent in a way that it can see the network.
  // The best way is to keep a hardhat node running OR run the agent code directly here.
  // Since we can't easily import ES modules with full context here, we'll use a shell command
  // but we MUST have a node running.
}

main().catch(console.error);

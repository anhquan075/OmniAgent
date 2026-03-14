const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting AFOS Full Flow Deployment...");
  
  const [owner, agent] = await ethers.getSigners();
  console.log("Owner:", owner.address);
  console.log("Agent:", agent.address);

  // 1. Deploy Mock USDT
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdt = await MockUSDC.deploy();
  console.log("Mock USDT deployed to:", usdt.target);

  // 2. Deploy Mock ZK Oracle
  const ZKOracle = await ethers.getContractFactory("ZKRiskOracle");
  // We'll mock the risk level later if needed. For now, it just needs to be deployed.
  const zkOracle = await ZKOracle.deploy(owner.address);
  console.log("ZK Oracle deployed to:", zkOracle.target);

  // 3. Deploy Mock Circuit Breaker
  const Breaker = await ethers.getContractFactory("MockCircuitBreaker");
  const breaker = await Breaker.deploy();
  console.log("Circuit Breaker deployed to:", breaker.target);

  // 4. Deploy ProofVault (the updated one)
  const ProofVault = await ethers.getContractFactory("ProofVault");
  const vault = await ProofVault.deploy(
    usdt.target,
    "ProofVault USDT",
    "pvUSDT",
    owner.address,
    1000 // 10% buffer
  );
  console.log("ProofVault deployed to:", vault.target);

  // 4.5 Deploy dependencies for Strategy Engine
  const MockOracle = await ethers.getContractFactory("MockPriceOracle");
  const oracle = await MockOracle.deploy(100000000, owner.address); // 1.00 USD
  console.log("Mock Oracle deployed to:", oracle.target);

  const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
  const policy = await RiskPolicy.deploy(
    3600, // cooldown
    1000, // guardedVolBps
    2000, // drawdownVolBps
    99000000, // depegPrice
    100, // maxSlippageBps
    200, // maxBountyBps
    5000, // normalAsterBps (must be <= guarded)
    8000, // guardedAsterBps (must be <= drawdown)
    10000, // drawdownAsterBps
    50, // minBountyBps
    3600, // auctionDurationSeconds
    1000, // idleBufferBps
    7, // sharpeWindowSize
    100, // sharpeLowThreshold
    1000, // normalLpBps (must be >= guarded)
    500, // guardedLpBps (must be >= drawdown)
    0 // drawdownLpBps
  );
  console.log("RiskPolicy deployed to:", policy.target);

  const SharpeTracker = await ethers.getContractFactory("SharpeTracker");
  const sharpe = await SharpeTracker.deploy(7);
  console.log("SharpeTracker deployed to:", sharpe.target);

  // 5. Deploy Strategy Engine
  const StrategyEngine = await ethers.getContractFactory("StrategyEngine");
  const engine = await StrategyEngine.deploy(
    vault.target,
    policy.target,
    oracle.target,
    breaker.target,
    sharpe.target,
    100000000 // initialPrice
  );
  console.log("StrategyEngine deployed to:", engine.target);

  // Setup Vault
  await vault.setEngine(engine.target);
  
  // We need mock adapters for the engine to execute without reverting immediately
  const MockAdapter = await ethers.getContractFactory("MockAsterEarnAdapter");
  const adapter = await MockAdapter.deploy(usdt.target, owner.address);
  await adapter.setVault(vault.target);
  await vault.setAdapters(adapter.target, adapter.target, ethers.ZeroAddress);
  await vault.lockConfiguration();

  // 6. Deploy Group Syndicate
  const Syndicate = await ethers.getContractFactory("GroupSyndicate");
  const syndicate = await Syndicate.deploy(
    vault.target,
    ethers.parseUnits("100", 6), // 100 USDT
    604800, // 1 week
    [owner.address, agent.address],
    agent.address
  );
  console.log("GroupSyndicate deployed to:", syndicate.target);

  // Provide some initial state
  console.log("Minting USDT to Agent and Owner...");
  await usdt.mint(agent.address, ethers.parseUnits("10000", 18)); // Mock uses 18 or 6 depending on contract, but WDK agent assumes 18 in its scripts, let's use 18 for this mock flow if the Vault uses it. Wait, the mock USDT uses 6 decimals.
  // We'll just use the standard parseUnits with 18 for the agent since agent code has `ethers.parseUnits(args.amount, 18)`.
  
  // Update .env.wdk
  const envPath = path.resolve(__dirname, "../.env.wdk");
  let envConfig = fs.readFileSync(envPath, "utf8");
  
  envConfig = envConfig.replace(/WDK_VAULT_ADDRESS=.*/g, `WDK_VAULT_ADDRESS=${vault.target}`);
  envConfig = envConfig.replace(/WDK_ENGINE_ADDRESS=.*/g, `WDK_ENGINE_ADDRESS=${engine.target}`);
  envConfig = envConfig.replace(/WDK_BREAKER_ADDRESS=.*/g, `WDK_BREAKER_ADDRESS=${breaker.target}`);
  envConfig = envConfig.replace(/WDK_USDT_ADDRESS=.*/g, `WDK_USDT_ADDRESS=${usdt.target}`);
  envConfig = envConfig.replace(/WDK_ZK_ORACLE_ADDRESS=.*/g, `WDK_ZK_ORACLE_ADDRESS=${zkOracle.target}`);
  
  // Inject Syndicate address if not there
  if (!envConfig.includes("WDK_SYNDICATE_ADDRESS")) {
      envConfig += `\nWDK_SYNDICATE_ADDRESS=${syndicate.target}\n`;
  } else {
      envConfig = envConfig.replace(/WDK_SYNDICATE_ADDRESS=.*/g, `WDK_SYNDICATE_ADDRESS=${syndicate.target}`);
  }

  fs.writeFileSync(envPath, envConfig);
  console.log(".env.wdk updated with local addresses.");

  // Also setup WDK Agent to have funds to send TXs.
  console.log("Funding WDK Agent with ETH...");
  // Use ether's HDNodeWallet to derive the exact same address the WDK would get for "bnb" 
  // (WDK EVM default path is m/44'/60'/0'/0/0)
  const seed = "test test test test test test test test test test test junk";
  const wdkWallet = ethers.HDNodeWallet.fromPhrase(seed);
  console.log("Derived WDK Agent Address:", wdkWallet.address);

  await owner.sendTransaction({
    to: wdkWallet.address,
    value: ethers.parseEther("10.0") // 10 ETH
  });
  console.log("Funded Agent with 10 ETH.");

  // Mint USDT directly to Agent so it can deposit
  await usdt.mint(wdkWallet.address, ethers.parseUnits("10000", 6));
  
  // Provide syndicate members with USDT
  await usdt.mint(owner.address, ethers.parseUnits("1000", 6));
  await usdt.connect(owner).approve(syndicate.target, ethers.MaxUint256);
  await syndicate.connect(owner).contribute();
  console.log("Owner contributed to Syndicate.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

import { ethers } from "hardhat";
import { loadEnv, updateEnv, getDeployer, logNetwork, addr } from "./deploy-helpers";

async function hasContract(addr: string): Promise<boolean> {
  try {
    const code = await ethers.provider.getCode(addr);
    return code !== "0x";
  } catch {
    return false;
  }
}

async function deployMockTokens() {
  const env = loadEnv();
  const addresses: Record<string, string> = {};
  const MockERC20 = await ethers.getContractFactory("MockERC20");

  // Check for real Tether tokens on Sepolia first
  const sepoliaUsdt = env.SEPOLIA_USDT_ADDRESS || "0xd077a400968890eacc75cdc901f0356c943e4fdb";
  const sepoliaXaut = env.SEPOLIA_XAUT_ADDRESS || "0x810249eF893D98ac8da4d6EB018E8CF7c16d536c";

  // Use real Sepolia USDT if available and not a mock
  const networkUsdt = env.SEPOLIA_USDT_ADDRESS || sepoliaUsdt;
  const usdtCandidate = networkUsdt || env.WDK_USDT_ADDRESS;
  if (usdtCandidate && (await hasContract(usdtCandidate))) {
    // Check if it's a mock or real by trying to call name()
    try {
      const usdt = new ethers.Contract(usdtCandidate, ['function name() view returns (string)'], ethers.provider);
      const name = await usdt.name();
      console.log(`Using USDT: ${usdtCandidate} (${name})`);
      addresses.WDK_USDT_ADDRESS = usdtCandidate;
    } catch {
      // Not a valid ERC20, deploy mock
      console.log(`Deploying mock USDT...`);
      const usdt = await (await MockERC20.deploy("Tether USD", "USDT")).waitForDeployment();
      await (await usdt.setDecimals(6)).wait();
      addresses.WDK_USDT_ADDRESS = await addr(usdt);
      console.log(`Mock USDT (6 dec): ${addresses.WDK_USDT_ADDRESS}`);
      updateEnv(addresses);
    }
  } else {
    const usdt = await (await MockERC20.deploy("Tether USD", "USDT")).waitForDeployment();
    await (await usdt.setDecimals(6)).wait();
    addresses.WDK_USDT_ADDRESS = await addr(usdt);
    console.log(`Mock USDT (6 dec): ${addresses.WDK_USDT_ADDRESS}`);
    updateEnv(addresses);
  }

  // Use real Sepolia XAUT if available
  const networkXaut = env.SEPOLIA_XAUT_ADDRESS || sepoliaXaut;
  const xautCandidate = networkXaut || env.WDK_XAUT_ADDRESS;
  if (xautCandidate && (await hasContract(xautCandidate))) {
    try {
      const xaut = new ethers.Contract(xautCandidate, ['function name() view returns (string)'], ethers.provider);
      const name = await xaut.name();
      console.log(`Using XAUT: ${xautCandidate} (${name})`);
      addresses.WDK_XAUT_ADDRESS = xautCandidate;
    } catch {
      console.log(`Deploying mock XAUT...`);
      const xaut = await (await MockERC20.deploy("Tether Gold", "XAUT")).waitForDeployment();
      await (await xaut.setDecimals(4)).wait();
      addresses.WDK_XAUT_ADDRESS = await addr(xaut);
      console.log(`Mock XAUT (4 dec): ${addresses.WDK_XAUT_ADDRESS}`);
      updateEnv(addresses);
    }
  } else {
    const xaut = await (await MockERC20.deploy("Tether Gold", "XAUT")).waitForDeployment();
    await (await xaut.setDecimals(4)).wait();
    addresses.WDK_XAUT_ADDRESS = await addr(xaut);
    console.log(`Mock XAUT (4 dec): ${addresses.WDK_XAUT_ADDRESS}`);
    updateEnv(addresses);
  }

  return addresses;
}

async function deployMockOracles(usdtAddr: string, xautAddr: string) {
  const env = loadEnv();
  const addresses: Record<string, string> = {};

  const CHAINLINK_ETH_USD = env.WDK_USDT_ORACLE_ADDRESS || "0xAbb4A2c701792f28D8e05D93F27cDadC75110917";
  const CHAINLINK_BTC_USD = env.WDK_XAUT_ORACLE_ADDRESS || "0xf3c8EA354B667771F69400Ea471316c13913455a";

  if (await hasContract(CHAINLINK_ETH_USD)) {
    console.log(`Using ChainlinkOracleAdapter for ETH/USD: ${CHAINLINK_ETH_USD}`);
    addresses.WDK_USDT_ORACLE_ADDRESS = CHAINLINK_ETH_USD;
  } else {
    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    const usdtOracle = await (await MockPriceOracle.deploy(ethers.parseUnits("1", 8))).waitForDeployment();
    addresses.WDK_USDT_ORACLE_ADDRESS = await addr(usdtOracle);
    console.log(`Mock USDT Oracle: ${addresses.WDK_USDT_ORACLE_ADDRESS}`);
  }

  if (await hasContract(CHAINLINK_BTC_USD)) {
    console.log(`Using ChainlinkOracleAdapter for BTC/USD: ${CHAINLINK_BTC_USD}`);
    addresses.WDK_XAUT_ORACLE_ADDRESS = CHAINLINK_BTC_USD;
  } else {
    const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
    const xautOracle = await (await MockPriceOracle.deploy(ethers.parseUnits("2000", 8))).waitForDeployment();
    addresses.WDK_XAUT_ORACLE_ADDRESS = await addr(xautOracle);
    console.log(`Mock XAUT Oracle: ${addresses.WDK_XAUT_ORACLE_ADDRESS}`);
  }

  updateEnv(addresses);
  return addresses;
}

async function deployCoreContracts(
  usdtAddr: string,
  xautAddr: string,
  usdtOracleAddr: string,
  usdtChainlinkAddr: string
) {
  const env = loadEnv();
  const deployer = await getDeployer();

  let policyAddr: string;
  const policyExists = env.RISK_POLICY_ADDRESS ? await hasContract(env.RISK_POLICY_ADDRESS) : false;
  if (policyExists) {
    policyAddr = env.RISK_POLICY_ADDRESS;
    console.log(`RiskPolicy (resume): ${policyAddr}`);
  } else {
    const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
    const tx_policy = await RiskPolicy.deploy(
      300, 150, 500,
      ethers.parseUnits("0.97", 8), 100, 100,
      1000, 5000, 9500,
      5, 3600, 500,
      20, 1500,
      1000, 1000, 500,
      3000,
      ethers.parseUnits("1.5", 18),
      { gasLimit: 8_000_000 }
    );
    const policy = await tx_policy.waitForDeployment();
    policyAddr = await addr(policy);
    console.log(`RiskPolicy: ${policyAddr}`);
    updateEnv({ RISK_POLICY_ADDRESS: policyAddr });
  }

  let sharpeTrackerAddr: string;
  const sharpeExists = env.SHARPE_TRACKER_ADDRESS ? await hasContract(env.SHARPE_TRACKER_ADDRESS) : false;
  if (sharpeExists) {
    sharpeTrackerAddr = env.SHARPE_TRACKER_ADDRESS;
    console.log(`SharpeTracker (resume): ${sharpeTrackerAddr}`);
  } else {
    const SharpeTracker = await ethers.getContractFactory("SharpeTracker");
    const sharpeTracker = await (await SharpeTracker.deploy(20)).waitForDeployment();
    sharpeTrackerAddr = await addr(sharpeTracker);
    console.log(`SharpeTracker: ${sharpeTrackerAddr}`);
    updateEnv({ SHARPE_TRACKER_ADDRESS: sharpeTrackerAddr });
  }

  let poolAddr: string;
  const poolExists = env.STABLESWAP_POOL_ADDRESS ? await hasContract(env.STABLESWAP_POOL_ADDRESS) : false;
  if (poolExists) {
    poolAddr = env.STABLESWAP_POOL_ADDRESS;
    console.log(`MockStableSwap Pool (resume): ${poolAddr}`);
  } else {
    const MockStableSwap = await ethers.getContractFactory("MockStableSwapPoolWithLPSupport");
    try {
      const pool = await MockStableSwap.deploy(
        usdtAddr, xautAddr,
        ethers.parseUnits("1000000", 18),
        ethers.parseUnits("1000000", 18),
        ethers.parseUnits("1", 18), 0,
        { gasLimit: 10_000_000 }
      );
      await pool.waitForDeployment();
      poolAddr = await pool.getAddress();
    } catch (e: any) {
      throw new Error(`MockStableSwap deploy failed. Ensure USDT (${usdtAddr}) and XAUT (${xautAddr}) are valid ERC20 contracts with >0 decimals. Error: ${e.message}`);
    }
    console.log(`MockStableSwap Pool: ${poolAddr}`);
    updateEnv({ STABLESWAP_POOL_ADDRESS: poolAddr });
  }

  let breakerAddr: string;
  const breakerExists = env.WDK_BREAKER_ADDRESS ? await hasContract(env.WDK_BREAKER_ADDRESS) : false;
  if (breakerExists) {
    breakerAddr = env.WDK_BREAKER_ADDRESS;
    console.log(`CircuitBreaker (resume): ${breakerAddr}`);
  } else {
    const CircuitBreaker = await ethers.getContractFactory("CircuitBreaker");
    try {
      const breaker = await CircuitBreaker.deploy(
        usdtChainlinkAddr, poolAddr, 50, 100, 50, 3600, 999999999,
        { gasLimit: 5_000_000 }
      );
      await breaker.waitForDeployment();
      breakerAddr = await breaker.getAddress();
    } catch (e: any) {
      throw new Error(`CircuitBreaker deploy failed. Pool: ${poolAddr}, Chainlink: ${usdtChainlinkAddr}. Error: ${e.message}`);
    }
    console.log(`CircuitBreaker: ${breakerAddr}`);
    updateEnv({ WDK_BREAKER_ADDRESS: breakerAddr });
  }

  return { policyAddr, sharpeTrackerAddr, poolAddr, breakerAddr };
}

async function deployVaultAndEngine(
  usdtAddr: string,
  policyAddr: string,
  usdtOracleAddr: string,
  breakerAddr: string,
  sharpeTrackerAddr: string
) {
  const env = loadEnv();
  const deployer = await getDeployer();

  let vaultAddr: string;
  const vaultExists = env.WDK_VAULT_ADDRESS ? await hasContract(env.WDK_VAULT_ADDRESS) : false;
  if (vaultExists) {
    vaultAddr = env.WDK_VAULT_ADDRESS;
    console.log(`OmniAgentVault (resume): ${vaultAddr}`);
  } else {
    const OmniAgentVault = await ethers.getContractFactory("OmniAgentVault");
    const vault = await (await OmniAgentVault.deploy(
      usdtAddr, "OmniAgent WDK Vault", "OWDK", deployer.address, 500
    )).waitForDeployment();
    vaultAddr = await addr(vault);
    console.log(`OmniAgentVault: ${vaultAddr}`);
    updateEnv({ WDK_VAULT_ADDRESS: vaultAddr });
  }

  let engineAddr: string;
  const engineExists = env.WDK_ENGINE_ADDRESS ? await hasContract(env.WDK_ENGINE_ADDRESS) : false;
  if (engineExists) {
    engineAddr = env.WDK_ENGINE_ADDRESS;
    console.log(`StrategyEngine (resume): ${engineAddr}`);
  } else {
    let priceOracleAddr = usdtOracleAddr;
    console.log(`Using Chainlink oracle for StrategyEngine: ${priceOracleAddr}`);
    
    const StrategyEngine = await ethers.getContractFactory("StrategyEngine");
    const engine = await (await StrategyEngine.deploy(
      vaultAddr, policyAddr, priceOracleAddr, breakerAddr, sharpeTrackerAddr,
      ethers.parseUnits("1", 8)
    )).waitForDeployment();
    engineAddr = await addr(engine);
    console.log(`StrategyEngine: ${engineAddr}`);
    updateEnv({ WDK_ENGINE_ADDRESS: engineAddr });
  }

  return { vaultAddr, engineAddr };
}

async function deployAdapters(usdtAddr: string, xautAddr: string, xautOracleAddr: string, usdtOracleAddr: string) {
  const env = loadEnv();
  const deployer = await getDeployer();

  let xautAdapterAddr: string;
  const xautAdapterExists = env.WDK_XAUT_ADAPTER_ADDRESS ? await hasContract(env.WDK_XAUT_ADAPTER_ADDRESS) : false;
  if (xautAdapterExists) {
    xautAdapterAddr = env.WDK_XAUT_ADAPTER_ADDRESS;
    console.log(`XAUT Adapter (resume): ${xautAdapterAddr}`);
  } else {
    const XAUTYieldAdapter = await ethers.getContractFactory("XAUTYieldAdapter");
    const xautAdapter = await (await XAUTYieldAdapter.deploy(
      usdtAddr, xautAddr, xautOracleAddr, usdtOracleAddr, deployer.address
    )).waitForDeployment();
    xautAdapterAddr = await addr(xautAdapter);
    console.log(`XAUT Adapter: ${xautAdapterAddr}`);
    updateEnv({ WDK_XAUT_ADAPTER_ADDRESS: xautAdapterAddr });
  }

  let secondaryAdapterAddr: string;
  const secAdapterExists = env.WDK_SECONDARY_ADAPTER_ADDRESS ? await hasContract(env.WDK_SECONDARY_ADAPTER_ADDRESS) : false;
  if (secAdapterExists) {
    secondaryAdapterAddr = env.WDK_SECONDARY_ADAPTER_ADDRESS;
    console.log(`Secondary Adapter (resume): ${secondaryAdapterAddr}`);
  } else {
    const ManagedAdapter = await ethers.getContractFactory("ManagedAdapter");
    const secondaryAdapter = await (await ManagedAdapter.deploy(usdtAddr, deployer.address)).waitForDeployment();
    secondaryAdapterAddr = await addr(secondaryAdapter);
    console.log(`Secondary Adapter: ${secondaryAdapterAddr}`);
    updateEnv({ WDK_SECONDARY_ADAPTER_ADDRESS: secondaryAdapterAddr });
  }

  let lpAdapterAddr: string;
  const lpAdapterExists = env.WDK_LP_ADAPTER_ADDRESS ? await hasContract(env.WDK_LP_ADAPTER_ADDRESS) : false;
  if (lpAdapterExists) {
    lpAdapterAddr = env.WDK_LP_ADAPTER_ADDRESS;
    console.log(`LP Adapter (resume): ${lpAdapterAddr}`);
  } else {
    const ManagedAdapter = await ethers.getContractFactory("ManagedAdapter");
    const lpAdapter = await (await ManagedAdapter.deploy(usdtAddr, deployer.address)).waitForDeployment();
    lpAdapterAddr = await addr(lpAdapter);
    console.log(`LP Adapter: ${lpAdapterAddr}`);
    updateEnv({ WDK_LP_ADAPTER_ADDRESS: lpAdapterAddr });
  }

  let lendingAdapterAddr: string;
  const lendingAdapterExists = env.WDK_LENDING_ADAPTER_ADDRESS ? await hasContract(env.WDK_LENDING_ADAPTER_ADDRESS) : false;
  if (lendingAdapterExists) {
    lendingAdapterAddr = env.WDK_LENDING_ADAPTER_ADDRESS;
    console.log(`Lending Adapter (resume): ${lendingAdapterAddr}`);
  } else {
    const AAVE_V3_POOL = env.AAVE_V3_POOL_ARBITRUM || "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";
    let poolAddress: string;

    if (await hasContract(AAVE_V3_POOL)) {
      console.log(`Using real Aave V3 Pool: ${AAVE_V3_POOL}`);
      poolAddress = AAVE_V3_POOL;
    } else {
      const MockAavePool = await ethers.getContractFactory("MockAavePool");
      const aavePool = await (await MockAavePool.deploy(usdtAddr, usdtAddr)).waitForDeployment();
      poolAddress = await addr(aavePool);
      console.log(`Mock Aave Pool: ${poolAddress}`);
    }

    const AaveLendingAdapter = await ethers.getContractFactory("AaveLendingAdapter");
    const lendingAdapter = await (await AaveLendingAdapter.deploy(
      usdtAddr, usdtAddr, poolAddress, deployer.address
    )).waitForDeployment();
    lendingAdapterAddr = await addr(lendingAdapter);
    console.log(`Lending Adapter: ${lendingAdapterAddr}`);
    updateEnv({ WDK_LENDING_ADAPTER_ADDRESS: lendingAdapterAddr });
  }

  return { xautAdapterAddr, secondaryAdapterAddr, lpAdapterAddr, lendingAdapterAddr };
}

async function wireContracts(
  vaultAddr: string,
  engineAddr: string,
  xautAdapterAddr: string,
  secondaryAdapterAddr: string,
  lpAdapterAddr: string,
  lendingAdapterAddr: string,
  sharpeTrackerAddr: string
) {
  const sharpeTracker = await ethers.getContractAt("SharpeTracker", sharpeTrackerAddr);
  await (await sharpeTracker.setEngine(engineAddr)).wait();

  const vault = await ethers.getContractAt("OmniAgentVault", vaultAddr);
  await (await vault.setEngine(engineAddr)).wait();
  await (await vault.setAdapters(xautAdapterAddr, secondaryAdapterAddr, lpAdapterAddr, lendingAdapterAddr)).wait();

  const xautAdapter = await ethers.getContractAt("XAUTYieldAdapter", xautAdapterAddr);
  await (await xautAdapter.setVault(vaultAddr)).wait();

  const secondaryAdapter = await ethers.getContractAt("ManagedAdapter", secondaryAdapterAddr);
  await (await secondaryAdapter.setVault(vaultAddr)).wait();

  const lpAdapter = await ethers.getContractAt("ManagedAdapter", lpAdapterAddr);
  await (await lpAdapter.setVault(vaultAddr)).wait();

  const lendingAdapter = await ethers.getContractAt("AaveLendingAdapter", lendingAdapterAddr);
  await (await lendingAdapter.setVault(vaultAddr)).wait();
  console.log("Wiring complete.");

  await (await xautAdapter.lockConfiguration()).wait();
  await (await secondaryAdapter.lockConfiguration()).wait();
  await (await lpAdapter.lockConfiguration()).wait();
  await (await lendingAdapter.lockConfiguration()).wait();
  await (await vault.lockConfiguration()).wait();
  console.log("Configurations locked.");

  const currentEngine = await vault.engine();
  if (currentEngine === ethers.ZeroAddress) throw new Error("Failed to set Vault Engine!");
  console.log(`Vault Engine verified: ${currentEngine}`);
}

async function seedVault(usdtAddr: string, vaultAddr: string, userCount = 10) {
  const deployer = await getDeployer();
  const usdt = await ethers.getContractAt("MockERC20", usdtAddr);
  const vault = await ethers.getContractAt("OmniAgentVault", vaultAddr);
  const seedAmount = ethers.parseUnits("10000", 6);

  console.log(`Seeding ${userCount} users with ${ethers.formatUnits(seedAmount, 6)} USDT each...`);

  for (let i = 0; i < userCount; i++) {
    const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
    await (await deployer.sendTransaction({ to: wallet.address, value: ethers.parseEther("0.1") })).wait();
    await (await usdt.mint(wallet.address, seedAmount)).wait();
    await (await usdt.connect(wallet).approve(vaultAddr, seedAmount)).wait();
    await (await vault.connect(wallet).deposit(seedAmount, wallet.address)).wait();
    console.log(`  Seeded User ${i + 1}: ${wallet.address}`);
  }
}

async function cmdFull() {
  console.log("=== Full Stack Deployment ===\n");
  const deployer = await getDeployer();
  console.log(`Deployer: ${deployer.address}`);
  await logNetwork();

  console.log("\n--- Phase 1: Tokens ---");
  const tokens = await deployMockTokens();

  console.log("\n--- Phase 2: Oracles ---");
  const oracles = await deployMockOracles(tokens.WDK_USDT_ADDRESS, tokens.WDK_XAUT_ADDRESS);

  console.log("\n--- Phase 3: Core ---");
  const core = await deployCoreContracts(
    tokens.WDK_USDT_ADDRESS, tokens.WDK_XAUT_ADDRESS,
    oracles.WDK_USDT_ORACLE_ADDRESS, oracles._usdtChainlink
  );

  console.log("\n--- Phase 4: Vault & Engine ---");
  const { vaultAddr, engineAddr } = await deployVaultAndEngine(
    tokens.WDK_USDT_ADDRESS, core.policyAddr,
    oracles.WDK_USDT_ORACLE_ADDRESS, core.breakerAddr, core.sharpeTrackerAddr
  );

  console.log("\n--- Phase 5: Adapters ---");
  const adapters = await deployAdapters(
    tokens.WDK_USDT_ADDRESS, tokens.WDK_XAUT_ADDRESS,
    oracles.WDK_XAUT_ORACLE_ADDRESS, oracles.WDK_USDT_ORACLE_ADDRESS
  );

  console.log("\n--- Phase 6: Wiring ---");
  await wireContracts(
    vaultAddr, engineAddr,
    adapters.xautAdapterAddr, adapters.secondaryAdapterAddr,
    adapters.lpAdapterAddr, adapters.lendingAdapterAddr,
    core.sharpeTrackerAddr
  );

  console.log("\n--- Phase 6.5: PolicyGuard & AgentNFA ---");
  const PolicyGuard = await ethers.getContractFactory("PolicyGuard");
  const policyGuard = await PolicyGuard.deploy(
    deployer.address,
    ethers.parseUnits("100000", 6),
    ethers.parseUnits("1000000", 6),
    10000,
    3600
  );
  await policyGuard.waitForDeployment();
  const policyGuardAddr = await addr(policyGuard);
  console.log(`PolicyGuard: ${policyGuardAddr}`);

  const AgentNFA = await ethers.getContractFactory("AgentNFA");
  const agentNFA = await AgentNFA.deploy();
  await agentNFA.waitForDeployment();
  const agentNFAAddr = await addr(agentNFA);
  console.log(`AgentNFA: ${agentNFAAddr}`);

  await (await agentNFA.mint(deployer.address, deployer.address, policyGuardAddr)).wait();
  console.log("Agent #0 minted for deployer");

  await (await policyGuard.whitelistReceiver(vaultAddr)).wait();
  console.log(`Whitelisted Vault: ${vaultAddr}`);
  await (await policyGuard.whitelistReceiver(engineAddr)).wait();
  console.log(`Whitelisted Engine: ${engineAddr}`);

  console.log("\n--- Phase 7: Seeding ---");
  await seedVault(tokens.WDK_USDT_ADDRESS, vaultAddr);

  await (await ethers.getContractAt("MockERC20", tokens.WDK_XAUT_ADDRESS))
    .mint(adapters.xautAdapterAddr, ethers.parseUnits("10", 4));
  console.log("Seeded XAUT Adapter with 10.0 oz Gold");

  updateEnv({
    WDK_VAULT_ADDRESS: vaultAddr,
    WDK_ENGINE_ADDRESS: engineAddr,
    WDK_USDT_ADDRESS: tokens.WDK_USDT_ADDRESS,
    WDK_XAUT_ADDRESS: tokens.WDK_XAUT_ADDRESS,
    WDK_ZK_ORACLE_ADDRESS: oracles.WDK_USDT_ORACLE_ADDRESS,
    WDK_USDT_ORACLE_ADDRESS: oracles.WDK_USDT_ORACLE_ADDRESS,
    WDK_XAUT_ORACLE_ADDRESS: oracles.WDK_XAUT_ORACLE_ADDRESS,
    WDK_BREAKER_ADDRESS: core.breakerAddr,
    WDK_XAUT_ADAPTER_ADDRESS: adapters.xautAdapterAddr,
    WDK_SECONDARY_ADAPTER_ADDRESS: adapters.secondaryAdapterAddr,
    WDK_LP_ADAPTER_ADDRESS: adapters.lpAdapterAddr,
    WDK_LENDING_ADAPTER_ADDRESS: adapters.lendingAdapterAddr,
    WDK_POLICY_GUARD_ADDRESS: policyGuardAddr,
    WDK_AGENT_NFA_ADDRESS: agentNFAAddr,
  });

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("All addresses written to .env");
}

async function cmdZkOracle() {
  const deployer = await getDeployer();
  console.log(`Deployer: ${deployer.address}`);
  await logNetwork();

  const ZKRiskOracle = await ethers.getContractFactory("ZKRiskOracle");
  const oracle = await ZKRiskOracle.deploy(deployer.address);
  await oracle.waitForDeployment();
  const oracleAddr = await addr(oracle);

  console.log(`ZKRiskOracle: ${oracleAddr}`);
  console.log(`Verifier: ${deployer.address}`);

  updateEnv({ WDK_ZK_ORACLE_ADDRESS: oracleAddr });
  console.log("Updated .env");
}

async function cmdErc4337() {
  const env = loadEnv();
  const deployer = await getDeployer();
  console.log(`Deployer: ${deployer.address}`);
  await logNetwork();

  const ENTRY_POINT = env.ERC4337_ENTRYPOINT_ADDRESS || "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

  const SimpleAccountFactory = await ethers.getContractFactory("SimpleAccountFactory");
  const factory = await (await SimpleAccountFactory.deploy(ENTRY_POINT)).waitForDeployment();
  const factoryAddr = await addr(factory);

  console.log(`SimpleAccountFactory: ${factoryAddr}`);
  console.log(`EntryPoint: ${ENTRY_POINT}`);

  updateEnv({ ERC4337_FACTORY_ADDRESS: factoryAddr });
  console.log("Updated .env");
}

async function cmdMockAave() {
  const deployer = await getDeployer();
  console.log(`Deployer: ${deployer.address}`);
  await logNetwork();
  const env = loadEnv();

  const usdtAddr = env.WDK_USDT_ADDRESS;
  if (!usdtAddr) throw new Error("WDK_USDT_ADDRESS not set in .env. Deploy tokens first.");

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const aToken = await (await MockERC20.deploy("Aave USDT", "aUSDT")).waitForDeployment();
  await (await aToken.setDecimals(6)).wait();
  const aTokenAddr = await addr(aToken);
  console.log(`aToken (aUSDT): ${aTokenAddr}`);

  const MockAavePool = await ethers.getContractFactory("MockAavePool");
  const aavePool = await (await MockAavePool.deploy(usdtAddr, aTokenAddr)).waitForDeployment();
  const aavePoolAddr = await addr(aavePool);
  console.log(`MockAavePool: ${aavePoolAddr}`);

  const MockBridge = await ethers.getContractFactory("MockBridge");
  const bridge = await (await MockBridge.deploy()).waitForDeployment();
  const bridgeAddr = await addr(bridge);
  console.log(`MockBridge: ${bridgeAddr}`);

  updateEnv({
    MOCK_AAVE_POOL_ADDRESS: aavePoolAddr,
    MOCK_BRIDGE_ADDRESS: bridgeAddr,
    MOCK_ATOKEN_ADDRESS: aTokenAddr,
  });
  console.log("Updated .env");
}

async function cmdPolicyGuard() {
  const deployer = await getDeployer();
  console.log(`Deployer: ${deployer.address}`);
  await logNetwork();
  const env = loadEnv();

  const PolicyGuard = await ethers.getContractFactory("PolicyGuard");
  const policyGuard = await PolicyGuard.deploy(
    deployer.address,
    ethers.parseUnits("1000", 18),
    ethers.parseUnits("10000", 18),
    500,
    60
  );
  await policyGuard.waitForDeployment();
  const policyGuardAddr = await addr(policyGuard);
  console.log(`PolicyGuard: ${policyGuardAddr}`);

  const AgentNFA = await ethers.getContractFactory("AgentNFA");
  const agentNFA = await AgentNFA.deploy();
  await agentNFA.waitForDeployment();
  const agentNFAAddr = await addr(agentNFA);
  console.log(`AgentNFA: ${agentNFAAddr}`);

  await (await agentNFA.mint(deployer.address, deployer.address, policyGuardAddr)).wait();
  console.log("Agent #0 minted for deployer");

  if (env.WDK_VAULT_ADDRESS) {
    await policyGuard.whitelistReceiver(env.WDK_VAULT_ADDRESS);
    console.log(`Whitelisted Vault: ${env.WDK_VAULT_ADDRESS}`);
  }
  if (env.WDK_ENGINE_ADDRESS) {
    await policyGuard.whitelistReceiver(env.WDK_ENGINE_ADDRESS);
    console.log(`Whitelisted Engine: ${env.WDK_ENGINE_ADDRESS}`);
  }

  updateEnv({
    WDK_POLICY_GUARD_ADDRESS: policyGuardAddr,
    WDK_AGENT_NFA_ADDRESS: agentNFAAddr,
  });
  console.log("Updated .env");
}

async function cmdAdapters() {
  const deployer = await getDeployer();
  console.log(`Deployer: ${deployer.address}`);
  await logNetwork();
  const env = loadEnv();

  const usdtAddr = env.WDK_USDT_ADDRESS;
  const vaultAddr = env.WDK_VAULT_ADDRESS;
  if (!usdtAddr) throw new Error("WDK_USDT_ADDRESS not set in .env");
  if (!vaultAddr) throw new Error("WDK_VAULT_ADDRESS not set in .env");

  const MockAavePool = await ethers.getContractFactory("MockAavePool");
  const aavePool = await (await MockAavePool.deploy(usdtAddr, usdtAddr)).waitForDeployment();
  const aavePoolAddr = await addr(aavePool);
  console.log(`MockAavePool: ${aavePoolAddr}`);

  const AaveLendingAdapter = await ethers.getContractFactory("AaveLendingAdapter");
  const aaveAdapter = await (await AaveLendingAdapter.deploy(
    usdtAddr, usdtAddr, aavePoolAddr, deployer.address
  )).waitForDeployment();
  const aaveAdapterAddr = await addr(aaveAdapter);
  console.log(`AaveLendingAdapter: ${aaveAdapterAddr}`);

  const LayerZeroBridgeReceiver = await ethers.getContractFactory("LayerZeroBridgeReceiver");
  const lzAdapter = await (await LayerZeroBridgeReceiver.deploy(
    usdtAddr, ethers.ZeroAddress, deployer.address
  )).waitForDeployment();
  const lzAdapterAddr = await addr(lzAdapter);
  console.log(`LayerZeroBridgeReceiver: ${lzAdapterAddr}`);

  await (await (await ethers.getContractAt("AaveLendingAdapter", aaveAdapterAddr)).setVault(vaultAddr)).wait();
  await (await (await ethers.getContractAt("LayerZeroBridgeReceiver", lzAdapterAddr)).setVault(vaultAddr)).wait();
  console.log("Adapters wired to vault");

  // === Deploy ExecutionAuction (Rebalance Rights Auction) ===
  const TWENTY_MINUTES = 20 * 60;
  const TEN_MINUTES = 10 * 60;
  const ExecutionAuction = await ethers.getContractFactory("ExecutionAuction");
  const auction = await (await ExecutionAuction.deploy(
    engineAddr,      // IStrategyEngine
    vaultAddr,       // vault
    usdtAddr,        // USDT token
    TWENTY_MINUTES,  // bidWindow (20 min)
    TEN_MINUTES,     // executeWindow (10 min)
    ethers.parseUnits("10", 6),  // minBid (10 USDT)
    100              // minBidIncrementBps (1%)
  )).waitForDeployment();
  const auctionAddr = await addr(auction);
  console.log(`ExecutionAuction: ${auctionAddr}`);

  // === Deploy MultiOracleAggregator (3% deviation consensus) ===
  const chainlinkEthUsd = "0xAbb4A2c701792f28D8e05D93F27cDadC75110917"; // ChainlinkOracleAdapter for ETH/USD
  const chainlinkBtcUsd = "0xf3c8EA354B667771F69400Ea471316c13913455a"; // ChainlinkOracleAdapter for BTC/USD
  const MultiOracleAggregator = await ethers.getContractFactory("MultiOracleAggregator");
  const multiOracle = await (await MultiOracleAggregator.deploy(
    [chainlinkEthUsd, chainlinkBtcUsd],  // at least 2 oracles required
    deployer.address
  )).waitForDeployment();
  const multiOracleAddr = await addr(multiOracle);
  console.log(`MultiOracleAggregator: ${multiOracleAddr}`);

  // === Deploy TWAPMultiOracle (30-min TWAP, flash-loan resistant) ===
  const TWAPMultiOracle = await ethers.getContractFactory("TWAPMultiOracle");
  const twapOracle = await (await TWAPMultiOracle.deploy(
    [chainlinkEthUsd, chainlinkBtcUsd, multiOracleAddr],  // 3+ oracles required
    deployer.address
  )).waitForDeployment();
  const twapOracleAddr = await addr(twapOracle);
  console.log(`TWAPMultiOracle: ${twapOracleAddr}`);

  // === Deploy X402Registry (on-chain payment records) ===
  const X402Registry = await ethers.getContractFactory("X402Registry");
  const x402Registry = await (await X402Registry.deploy(deployer.address)).waitForDeployment();
  const x402RegistryAddr = await addr(x402Registry);
  console.log(`X402Registry: ${x402RegistryAddr}`);

  // === Deploy GroupSyndicate ===
  const GroupSyndicate = await ethers.getContractFactory("GroupSyndicate");
  const syndicate = await (await GroupSyndicate.deploy(vaultAddr, deployer.address)).waitForDeployment();
  const syndicateAddr = await addr(syndicate);
  console.log(`GroupSyndicate: ${syndicateAddr}`);

  updateEnv({
    WDK_AAVE_ADAPTER_ADDRESS: aaveAdapterAddr,
    WDK_LZ_ADAPTER_ADDRESS: lzAdapterAddr,
    WDK_AUCTION_ADDRESS: auctionAddr,
    WDK_TWAP_ORACLE_ADDRESS: twapOracleAddr,
    WDK_MULTI_ORACLE_ADDRESS: multiOracleAddr,
    WDK_X402_REGISTRY_ADDRESS: x402RegistryAddr,
    WDK_SYNDICATE_ADDRESS: syndicateAddr,
  });
  console.log("All contracts deployed and .env updated!");
}

async function cmdSeed() {
  const env = loadEnv();
  const usdtAddr = env.WDK_USDT_ADDRESS;
  const vaultAddr = env.WDK_VAULT_ADDRESS;
  if (!usdtAddr || !vaultAddr) throw new Error("WDK_USDT_ADDRESS and WDK_VAULT_ADDRESS must be set in .env");

  const deployer = await getDeployer();
  console.log(`Deployer: ${deployer.address}`);
  await logNetwork();

  const usdt = await ethers.getContractAt("MockERC20", usdtAddr);
  const vault = await ethers.getContractAt("OmniAgentVault", vaultAddr);

  const currentAssets = await vault.totalAssets();
  console.log(`Current vault assets: ${ethers.formatUnits(currentAssets, 6)} USDT`);

  const mintAmount = ethers.parseUnits("100000", 6);
  await (await usdt.mint(deployer.address, mintAmount)).wait();
  console.log(`Minted ${ethers.formatUnits(mintAmount, 6)} USDT`);

  await (await usdt.approve(vaultAddr, mintAmount)).wait();
  await (await vault.deposit(mintAmount, deployer.address)).wait();
  console.log(`Deposited ${ethers.formatUnits(mintAmount, 6)} USDT into vault`);

  const finalAssets = await vault.totalAssets();
  console.log(`Final vault assets: ${ethers.formatUnits(finalAssets, 6)} USDT`);
  console.log("Vault seeded successfully");
}

async function cmdInit() {
  const deployer = await getDeployer();
  console.log(`Deployer: ${deployer.address}`);
  await logNetwork();
  const env = loadEnv();

  const vaultAddr = env.WDK_VAULT_ADDRESS;
  const engineAddr = env.WDK_ENGINE_ADDRESS;
  if (!vaultAddr || !engineAddr) throw new Error("WDK_VAULT_ADDRESS and WDK_ENGINE_ADDRESS must be set");

  if (env.WDK_AAVE_ADAPTER_ADDRESS) {
    const aave = await ethers.getContractAt("AaveLendingAdapter", env.WDK_AAVE_ADAPTER_ADDRESS);
    await (await aave.setVault(vaultAddr)).wait();
    console.log(`Aave adapter vault set: ${vaultAddr}`);
  }

  if (env.WDK_LZ_ADAPTER_ADDRESS) {
    const lz = await ethers.getContractAt("LayerZeroBridgeReceiver", env.WDK_LZ_ADAPTER_ADDRESS);
    await (await lz.setVault(vaultAddr)).wait();
    console.log(`LZ adapter vault set: ${vaultAddr}`);
  }

  const vault = await ethers.getContractAt("OmniAgentVault", vaultAddr);
  await (await vault.setEngine(engineAddr)).wait();
  console.log(`Vault engine set: ${engineAddr}`);

  console.log("Initialization complete");
}

async function cmdWhitelist() {
  const env = loadEnv();
  const guardAddr = env.WDK_POLICY_GUARD_ADDRESS;
  if (!guardAddr) throw new Error("WDK_POLICY_GUARD_ADDRESS not set in .env");

  const guard = await ethers.getContractAt("PolicyGuard", guardAddr);

  if (env.WDK_VAULT_ADDRESS) {
    await guard.whitelistReceiver(env.WDK_VAULT_ADDRESS);
    console.log(`Whitelisted Vault: ${env.WDK_VAULT_ADDRESS}`);
  }
  if (env.WDK_ENGINE_ADDRESS) {
    await guard.whitelistReceiver(env.WDK_ENGINE_ADDRESS);
    console.log(`Whitelisted Engine: ${env.WDK_ENGINE_ADDRESS}`);
  }
  console.log("Whitelisting complete");
}

async function cmdDeployTwapOracle() {
  const deployer = await getDeployer();
  console.log(`Deployer: ${deployer.address}`);
  await logNetwork();

  // TWAPMultiOracle requires 3+ oracles with <5% deviation
  // Deploy 3 mock oracles with matching prices for consensus
  const MOCK_PRICE = ethers.parseUnits("2000", 8); // $2000.00
  const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");

  console.log("\n--- Deploying Mock Oracles for TWAP ---");
  const oracle1 = await (await MockPriceOracle.deploy(MOCK_PRICE)).waitForDeployment();
  const oracle1Addr = await addr(oracle1);
  console.log(`MockOracle #1: ${oracle1Addr}`);

  const oracle2 = await (await MockPriceOracle.deploy(MOCK_PRICE)).waitForDeployment();
  const oracle2Addr = await addr(oracle2);
  console.log(`MockOracle #2: ${oracle2Addr}`);

  const oracle3 = await (await MockPriceOracle.deploy(MOCK_PRICE)).waitForDeployment();
  const oracle3Addr = await addr(oracle3);
  console.log(`MockOracle #3: ${oracle3Addr}`);

  // Deploy TWAPMultiOracle using 3 mock oracles
  console.log("\n--- Deploying TWAPMultiOracle ---");
  const TWAPMultiOracle = await ethers.getContractFactory("TWAPMultiOracle");
  const twapOracle = await (await TWAPMultiOracle.deploy(
    [oracle1Addr, oracle2Addr, oracle3Addr],
    deployer.address
  )).waitForDeployment();
  const twapOracleAddr = await addr(twapOracle);
  console.log(`TWAPMultiOracle: ${twapOracleAddr}`);

  updateEnv({
    WDK_TWAP_MOCK_ORACLE_1: oracle1Addr,
    WDK_TWAP_MOCK_ORACLE_2: oracle2Addr,
    WDK_TWAP_MOCK_ORACLE_3: oracle3Addr,
    WDK_TWAP_ORACLE_ADDRESS: twapOracleAddr,
  });
  console.log("\nUpdated .env with TWAP oracle addresses");
}

async function cmdRedeployEngine() {
  const env = loadEnv();
  const deployer = await getDeployer();
  console.log(`Deployer: ${deployer.address}`);
  await logNetwork();

  // Check required dependencies
  if (!env.WDK_VAULT_ADDRESS) throw new Error("WDK_VAULT_ADDRESS not set in .env");
  if (!env.RISK_POLICY_ADDRESS) throw new Error("RISK_POLICY_ADDRESS not set in .env");
  if (!env.WDK_BREAKER_ADDRESS) throw new Error("WDK_BREAKER_ADDRESS not set in .env");
  if (!env.SHARPE_TRACKER_ADDRESS) throw new Error("SHARPE_TRACKER_ADDRESS not set in .env");
  if (!env.WDK_USDT_ORACLE_ADDRESS) throw new Error("WDK_USDT_ORACLE_ADDRESS not set in .env");

  // Verify contracts exist
  if (!(await hasContract(env.WDK_VAULT_ADDRESS))) throw new Error(`Vault contract not found at ${env.WDK_VAULT_ADDRESS}`);
  if (!(await hasContract(env.WDK_USDT_ORACLE_ADDRESS))) throw new Error(`USDT oracle contract not found at ${env.WDK_USDT_ORACLE_ADDRESS}`);
  if (!(await hasContract(env.RISK_POLICY_ADDRESS))) throw new Error(`RiskPolicy contract not found at ${env.RISK_POLICY_ADDRESS}`);
  if (!(await hasContract(env.WDK_BREAKER_ADDRESS))) throw new Error(`CircuitBreaker contract not found at ${env.WDK_BREAKER_ADDRESS}`);
  if (!(await hasContract(env.SHARPE_TRACKER_ADDRESS))) throw new Error(`SharpeTracker contract not found at ${env.SHARPE_TRACKER_ADDRESS}`);

  // Log deployment parameters
  console.log("Deployment parameters:");
  console.log(`  Vault: ${env.WDK_VAULT_ADDRESS}`);
  console.log(`  Policy: ${env.RISK_POLICY_ADDRESS}`);
  console.log(`  USDT Oracle: ${env.WDK_USDT_ORACLE_ADDRESS}`);
  console.log(`  Breaker: ${env.WDK_BREAKER_ADDRESS}`);
  console.log(`  SharpeTracker: ${env.SHARPE_TRACKER_ADDRESS}`);
  console.log(`  Initial Price: 1.0 (1e8)`);

  console.log("\n--- Deploying StrategyEngine with Chainlink oracle ---");
  const StrategyEngine = await ethers.getContractFactory("StrategyEngine");
  
  let engine;
  try {
    engine = await StrategyEngine.deploy(
      env.WDK_VAULT_ADDRESS,
      env.RISK_POLICY_ADDRESS,
      env.WDK_USDT_ORACLE_ADDRESS,
      env.WDK_BREAKER_ADDRESS,
      env.SHARPE_TRACKER_ADDRESS,
      ethers.parseUnits("1", 8),
      { gasLimit: 3000000 }
    );
    const tx = engine.deploymentTransaction();
    if (tx) {
      console.log(`Transaction hash: ${tx.hash}`);
      console.log(`Waiting for confirmation...`);
    }
    await engine.waitForDeployment();
  } catch (deployError: any) {
    console.error("Deployment failed:", deployError.message);
    if (deployError.data) {
      console.error("Revert data:", deployError.data);
    }
    if (deployError.reason) {
      console.error("Revert reason:", deployError.reason);
    }
    throw deployError;
  }
  
  const newEngineAddr = await addr(engine);
  console.log(`New StrategyEngine: ${newEngineAddr}`);
  console.log(`Old StrategyEngine: ${env.WDK_ENGINE_ADDRESS || 'none'}`);
  
  // Update .env with new engine address
  updateEnv({ WDK_ENGINE_ADDRESS: newEngineAddr });
  console.log("\nUpdated .env with new WDK_ENGINE_ADDRESS");
  
  console.log("\nNote: You may need to:");
  console.log("1. Update any hardcoded engine references in frontend/backend");
  console.log("2. Re-run 'whitelist' command if using PolicyGuard");
  console.log("3. Restart backend server");
}

const COMMANDS: Record<string, () => Promise<void>> = {
  full: cmdFull,
  "zk-oracle": cmdZkOracle,
  erc4337: cmdErc4337,
  "mock-aave": cmdMockAave,
  "policy-guard": cmdPolicyGuard,
  adapters: cmdAdapters,
  seed: cmdSeed,
  init: cmdInit,
  whitelist: cmdWhitelist,
  "twap-oracle": cmdDeployTwapOracle,
  "redeploy-engine": cmdRedeployEngine,
};

function printHelp() {
  console.log("Usage: DEPLOY_CMD=<cmd> npx hardhat run scripts/deploy.ts --network <net>\n");
  console.log("Commands:");
  console.log("  full           Deploy entire stack (tokens + oracles + core + vault + adapters + seed)");
  console.log("  zk-oracle      Deploy ZKRiskOracle");
  console.log("  erc4337        Deploy SimpleAccountFactory");
  console.log("  mock-aave      Deploy MockAavePool + MockBridge + aToken");
  console.log("  policy-guard   Deploy PolicyGuard + AgentNFA + whitelist");
  console.log("  adapters       Deploy fresh Aave + LZ adapters and wire to vault");
  console.log("  seed           Seed vault with 100k USDT from deployer");
  console.log("  init           Wire existing adapters to vault/engine");
  console.log("  whitelist      Whitelist vault/engine in existing PolicyGuard");
  console.log("  twap-oracle    Deploy ChainlinkOracleAdapters + TWAPMultiOracle (optional)");
  console.log("  redeploy-engine Redeploy StrategyEngine with Chainlink oracle (fixes oracle revert)");
}

async function main() {
  const command = process.env.DEPLOY_CMD;

  if (!command || !COMMANDS[command]) {
    printHelp();
    process.exit(command ? 1 : 0);
  }

  await COMMANDS[command]();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

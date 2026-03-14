const hre = require("hardhat");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function envOrDefault(name, defaultValue) {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const asset = requiredEnv("ASTER_ASSET_ADDRESS");
  const asterMinter = requiredEnv("ASTER_MINTER_ADDRESS");
  const depositSelector = requiredEnv("ASTER_DEPOSIT_SELECTOR");
  const withdrawSelector = requiredEnv("ASTER_WITHDRAW_SELECTOR");
  const managedAssetsSelector = requiredEnv("ASTER_MANAGED_ASSETS_SELECTOR");
  const oracleMode = envOrDefault("ORACLE_MODE", "chainlink").toLowerCase();

  const initialPrice = hre.ethers.parseUnits(envOrDefault("INITIAL_PRICE", "1"), 8);
  const cooldown = Number(envOrDefault("POLICY_COOLDOWN", "300"));
  const guardedVolBps = Number(envOrDefault("POLICY_GUARDED_VOL_BPS", "150"));
  const drawdownVolBps = Number(envOrDefault("POLICY_DRAWDOWN_VOL_BPS", "500"));
  const depegPrice = hre.ethers.parseUnits(envOrDefault("POLICY_DEPEG_PRICE", "0.97"), 8);
  const maxSlippageBps = Number(envOrDefault("POLICY_MAX_SLIPPAGE_BPS", "100"));
  const maxBountyBps = Number(envOrDefault("POLICY_MAX_BOUNTY_BPS", "50"));
  const normalAsterBps = Number(envOrDefault("POLICY_NORMAL_ASTER_BPS", "7000"));
  const guardedAsterBps = Number(envOrDefault("POLICY_GUARDED_ASTER_BPS", "9000"));
  const drawdownAsterBps = Number(envOrDefault("POLICY_DRAWDOWN_ASTER_BPS", "10000"));

  const ManagedAdapter = await hre.ethers.getContractFactory("ManagedAdapter");
  const secondaryAdapter = await ManagedAdapter.deploy(asset, deployer.address);
  await secondaryAdapter.waitForDeployment();

  const AsterEarnAdapter = await hre.ethers.getContractFactory("AsterEarnAdapter");
  const asterAdapter = await AsterEarnAdapter.deploy(
    asset,
    asterMinter,
    depositSelector,
    withdrawSelector,
    managedAssetsSelector,
    deployer.address
  );
  await asterAdapter.waitForDeployment();

  const ProofVault4626 = await hre.ethers.getContractFactory("ProofVault4626");
  const vault = await ProofVault4626.deploy(asset, "AsterPilot ProofVault Share", "apvSHARE", deployer.address);
  await vault.waitForDeployment();

  const RiskPolicy = await hre.ethers.getContractFactory("RiskPolicy");
  const policy = await RiskPolicy.deploy(
    cooldown,
    guardedVolBps,
    drawdownVolBps,
    depegPrice,
    maxSlippageBps,
    maxBountyBps,
    normalAsterBps,
    guardedAsterBps,
    drawdownAsterBps
  );
  await policy.waitForDeployment();

  let oracle;
  if (oracleMode === "chainlink") {
    const chainlinkFeed = requiredEnv("CHAINLINK_FEED_ADDRESS");
    const staleSeconds = Number(envOrDefault("ORACLE_STALE_SECONDS", "7200"));
    const ChainlinkPriceOracle = await hre.ethers.getContractFactory("ChainlinkPriceOracle");
    oracle = await ChainlinkPriceOracle.deploy(chainlinkFeed, staleSeconds);
    await oracle.waitForDeployment();
  } else {
    const MockPriceOracle = await hre.ethers.getContractFactory("MockPriceOracle");
    oracle = await MockPriceOracle.deploy(initialPrice, deployer.address);
    await oracle.waitForDeployment();
  }

  const StrategyEngine = await hre.ethers.getContractFactory("StrategyEngine");
  const engine = await StrategyEngine.deploy(
    await vault.getAddress(),
    await policy.getAddress(),
    await oracle.getAddress(),
    initialPrice
  );
  await engine.waitForDeployment();

  await (await vault.setEngine(await engine.getAddress())).wait();
  await (await vault.setAdapters(await asterAdapter.getAddress(), await secondaryAdapter.getAddress())).wait();

  await (await asterAdapter.setVault(await vault.getAddress())).wait();
  await (await secondaryAdapter.setVault(await vault.getAddress())).wait();

  await (await asterAdapter.lockConfiguration()).wait();
  await (await secondaryAdapter.lockConfiguration()).wait();
  if (oracleMode !== "chainlink") {
    await (await oracle.lock()).wait();
  }
  await (await vault.lockConfiguration()).wait();

  console.log("=== AsterPilot mainnet stack deployed ===");
  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer.address);
  console.log("Asset:", asset);
  console.log("Aster minter:", asterMinter);
  console.log("Oracle mode:", oracleMode);
  console.log("Vault:", await vault.getAddress());
  console.log("Engine:", await engine.getAddress());
  console.log("Policy:", await policy.getAddress());
  console.log("Oracle:", await oracle.getAddress());
  console.log("Aster adapter:", await asterAdapter.getAddress());
  console.log("Secondary adapter:", await secondaryAdapter.getAddress());
  console.log("Vault owner (expected zero):", await vault.owner());
  console.log("Aster adapter owner (expected zero):", await asterAdapter.owner());
  console.log("Secondary adapter owner (expected zero):", await secondaryAdapter.owner());
  if (oracleMode === "chainlink") {
    console.log("Oracle locked (expected true):", await oracle.locked());
  } else {
    console.log("Oracle owner (expected zero):", await oracle.owner());
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

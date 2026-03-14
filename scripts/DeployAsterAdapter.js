const hre = require("hardhat");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const asset = requiredEnv("ASTER_ASSET_ADDRESS");
  const asterMinter = requiredEnv("ASTER_MINTER_ADDRESS");
  const depositSelector = requiredEnv("ASTER_DEPOSIT_SELECTOR");
  const withdrawSelector = requiredEnv("ASTER_WITHDRAW_SELECTOR");
  const managedAssetsSelector = requiredEnv("ASTER_MANAGED_ASSETS_SELECTOR");

  const Adapter = await hre.ethers.getContractFactory("AsterEarnAdapter");
  const adapter = await Adapter.deploy(
    asset,
    asterMinter,
    depositSelector,
    withdrawSelector,
    managedAssetsSelector,
    deployer.address
  );
  await adapter.waitForDeployment();

  console.log("Deployer:", deployer.address);
  console.log("AsterEarnAdapter:", await adapter.getAddress());
  console.log("Asset:", asset);
  console.log("Aster minter:", asterMinter);
  console.log("Deposit selector:", depositSelector);
  console.log("Withdraw selector:", withdrawSelector);
  console.log("Managed assets selector:", managedAssetsSelector);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

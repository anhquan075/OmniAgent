import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { logger } from "../src/utils/logger";

async function main() {
  const [deployer] = await ethers.getSigners();
  logger.info("Deploying Mock Aave Pool and Bridge to Testnet...");
  logger.info(`Network: ${(await ethers.provider.getNetwork()).name}`);
  logger.info(`Deployer: ${deployer.address}`);

  logger.info("\n--- Phase 1: Mock Assets ---");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  
  const aToken = await (await MockERC20.deploy("Aave USDT", "aUSDT")).waitForDeployment();
  await (await aToken.setDecimals(6)).wait();
  const aTokenAddr = await aToken.getAddress();
  logger.info(`aToken (aUSDT): ${aTokenAddr}`);

  const usdtAddr = process.env.WDK_USDT_ADDRESS || "0x7d72c22d5f4D4a5D4c16eB4aB4b3D5e6aA12345";
  logger.info(`USDT: ${usdtAddr}`);

  logger.info("\n--- Phase 2: Mock Aave Pool ---");
  const MockAavePool = await ethers.getContractFactory("MockAavePool");
  const aavePool = await (await MockAavePool.deploy(usdtAddr, aTokenAddr)).waitForDeployment();
  const aavePoolAddr = await aavePool.getAddress();
  logger.info(`MockAavePool: ${aavePoolAddr}`);

  logger.info("\n--- Phase 3: Mock Bridge ---");
  const MockBridge = await ethers.getContractFactory("MockBridge");
  const bridge = await (await MockBridge.deploy()).waitForDeployment();
  const bridgeAddr = await bridge.getAddress();
  logger.info(`MockBridge: ${bridgeAddr}`);

  logger.info("\n--- Phase 4: Updating .env file ---");
  const envPath = path.join(__dirname, "../.env");
  let envContent = fs.readFileSync(envPath, "utf8");
  
  const aaveLine = `MOCK_AAVE_POOL_ADDRESS=${aavePoolAddr}`;
  const bridgeLine = `MOCK_BRIDGE_ADDRESS=${bridgeAddr}`;
  const aTokenLine = `MOCK_ATOKEN_ADDRESS=${aTokenAddr}`;
  
  if (envContent.includes("MOCK_AAVE_POOL_ADDRESS=")) {
    envContent = envContent.replace(/MOCK_AAVE_POOL_ADDRESS=.*/, aaveLine);
  } else {
    envContent += `\n${aaveLine}`;
  }
  
  if (envContent.includes("MOCK_BRIDGE_ADDRESS=")) {
    envContent = envContent.replace(/MOCK_BRIDGE_ADDRESS=.*/, bridgeLine);
  } else {
    envContent += `\n${bridgeLine}`;
  }
  
  if (envContent.includes("MOCK_ATOKEN_ADDRESS=")) {
    envContent = envContent.replace(/MOCK_ATOKEN_ADDRESS=.*/, aTokenLine);
  } else {
    envContent += `\n${aTokenLine}`;
  }
  
  fs.writeFileSync(envPath, envContent);
  logger.info(`Updated .env with mock addresses`);

  logger.info("\n=== DEPLOYMENT COMPLETE ===");
  logger.info(`MOCK_AAVE_POOL_ADDRESS=${aavePoolAddr}`);
  logger.info(`MOCK_BRIDGE_ADDRESS=${bridgeAddr}`);
  logger.info(`MOCK_ATOKEN_ADDRESS=${aTokenAddr}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(error);
    process.exit(1);
  });

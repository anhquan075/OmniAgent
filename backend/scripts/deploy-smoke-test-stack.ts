import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { logger } from "../src/utils/logger";

async function main() {
  const [deployer] = await ethers.getSigners();
  logger.info("Starting Smoke Test Stack Deployment...");
  logger.info(`Network: ${(await ethers.provider.getNetwork()).name}`);
  logger.info(`Deployer: ${deployer.address}`);

  // 1. Deploy Mock USDT (if not already deployed)
  logger.info("\n--- Phase 1: Mock Assets ---");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  
  const envPath = path.join(process.cwd(), '.env');
  let envLocal: Record<string, string> = {};
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        envLocal[key.trim()] = value.trim();
      }
    });
  }

  let usdtAddr = envLocal.WDK_USDT_ADDRESS;
  if (!usdtAddr) {
    const usdt = await (await MockERC20.deploy("Tether USD", "USDT")).waitForDeployment();
    await (await usdt.setDecimals(6)).wait();
    usdtAddr = await usdt.getAddress();
    logger.info(`Deployed USDT (6 dec): ${usdtAddr}`);
  } else {
    logger.info(`Using existing USDT: ${usdtAddr}`);
  }

  // 2. Deploy Mock Aave Pool and aToken
  logger.info("\n--- Phase 2: Mock Aave Protocol ---");
  const aToken = await (await MockERC20.deploy("Aave USDT", "aUSDT")).waitForDeployment();
  const aTokenAddr = await aToken.getAddress();
  logger.info(`Deployed aToken: ${aTokenAddr}`);

  const MockAavePool = await ethers.getContractFactory("MockAavePool");
  const mockAavePool = await (await MockAavePool.deploy(usdtAddr, aTokenAddr)).waitForDeployment();
  const mockAavePoolAddr = await mockAavePool.getAddress();
  logger.info(`Deployed MockAavePool: ${mockAavePoolAddr}`);

  // 3. Deploy AaveLendingAdapter
  logger.info("\n--- Phase 3: Aave Lending Adapter ---");
  const AaveLendingAdapter = await ethers.getContractFactory("AaveLendingAdapter");
  const aaveAdapter = await (await AaveLendingAdapter.deploy(
    usdtAddr,
    aTokenAddr,
    mockAavePoolAddr,
    deployer.address
  )).waitForDeployment();
  const aaveAdapterAddr = await aaveAdapter.getAddress();
  logger.info(`Deployed AaveLendingAdapter: ${aaveAdapterAddr}`);

  // 4. Deploy Mock LayerZero Endpoint and Bridge Receiver
  logger.info("\n--- Phase 4: Mock LayerZero Protocol ---");
  const MockLZEndpoint = await ethers.getContractFactory("MockLZEndpoint");
  const mockLZEndpoint = await (await MockLZEndpoint.deploy()).waitForDeployment();
  const mockLZEndpointAddr = await mockLZEndpoint.getAddress();
  logger.info(`Deployed MockLZEndpoint: ${mockLZEndpointAddr}`);

  const LayerZeroBridgeReceiver = await ethers.getContractFactory("LayerZeroBridgeReceiver");
  const lzBridgeReceiver = await (await LayerZeroBridgeReceiver.deploy(
    usdtAddr,
    mockLZEndpointAddr,
    deployer.address
  )).waitForDeployment();
  const lzBridgeReceiverAddr = await lzBridgeReceiver.getAddress();
  logger.info(`Deployed LayerZeroBridgeReceiver: ${lzBridgeReceiverAddr}`);

  // 5. Update .env with new addresses
  logger.info("\n--- Phase 5: Updating Environment ---");
  envLocal.WDK_USDT_ADDRESS = usdtAddr;
  envLocal.WDK_AAVE_ADAPTER_ADDRESS = aaveAdapterAddr;
  envLocal.WDK_LZ_ADAPTER_ADDRESS = lzBridgeReceiverAddr;
  
  // Convert envLocal back to string
  const envContent = Object.entries(envLocal)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  fs.writeFileSync(envPath, envContent);
  logger.info(`Updated .env with new addresses`);
  logger.info(`WDK_USDT_ADDRESS=${usdtAddr}`);
  logger.info(`WDK_AAVE_ADAPTER_ADDRESS=${aaveAdapterAddr}`);
  logger.info(`WDK_LZ_ADAPTER_ADDRESS=${lzBridgeReceiverAddr}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

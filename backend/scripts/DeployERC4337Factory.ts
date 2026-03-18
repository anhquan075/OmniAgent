import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { logger } from "../src/utils/logger";

async function main() {
  const [deployer] = await ethers.getSigners();
  logger.info("Deploying Mock ERC4337 Factory to Testnet...");
  logger.info(`Network: ${(await ethers.provider.getNetwork()).name}`);
  logger.info(`Deployer: ${deployer.address}`);

  const ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

  logger.info("\n--- Deploying SimpleAccountFactory ---");
  const SimpleAccountFactory = await ethers.getContractFactory("SimpleAccountFactory");
  const factory = await (await SimpleAccountFactory.deploy(ENTRY_POINT)).waitForDeployment();
  const factoryAddr = await factory.getAddress();
  logger.info(`SimpleAccountFactory: ${factoryAddr}`);

  logger.info("\n--- Updating .env file ---");
  const envPath = path.join(__dirname, "../.env");
  let envContent = fs.readFileSync(envPath, "utf8");
  
  const factoryLine = `ERC4337_FACTORY_ADDRESS=${factoryAddr}`;
  
  if (envContent.includes("ERC4337_FACTORY_ADDRESS=")) {
    envContent = envContent.replace(/ERC4337_FACTORY_ADDRESS=.*/, factoryLine);
  } else {
    envContent += `\n${factoryLine}`;
  }
  
  fs.writeFileSync(envPath, envContent);
  logger.info(`Updated .env with ERC4337_FACTORY_ADDRESS`);

  logger.info("\n=== DEPLOYMENT COMPLETE ===");
  logger.info(`ERC4337_FACTORY_ADDRESS=${factoryAddr}`);
  logger.info(`ERC4337_ENTRYPOINT_ADDRESS=${ENTRY_POINT}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(error);
    process.exit(1);
  });

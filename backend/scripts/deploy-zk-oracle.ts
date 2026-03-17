import { ethers } from "hardhat";
import { logger } from "../src/utils/logger";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy ZKRiskOracle contract
 * 
 * Usage:
 *   npx hardhat run scripts/deploy-zk-oracle.ts --network bscTestnet
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  logger.info("Deploying ZKRiskOracle...");
  logger.info(`Network: ${(await ethers.provider.getNetwork()).name}`);
  logger.info(`Deployer: ${deployer.address}`);

  const zkVerifier = deployer.address;
  
  const ZKRiskOracle = await ethers.getContractFactory("ZKRiskOracle");
  const oracle = await ZKRiskOracle.deploy(zkVerifier);
  await oracle.waitForDeployment();
  
  const oracleAddress = await oracle.getAddress();
  logger.info(`✅ ZKRiskOracle deployed: ${oracleAddress}`);
  logger.info(`   ZK Verifier: ${zkVerifier}`);

  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
    
    if (envContent.includes('WDK_ZK_ORACLE_ADDRESS=')) {
      envContent = envContent.replace(
        /WDK_ZK_ORACLE_ADDRESS=.*/,
        `WDK_ZK_ORACLE_ADDRESS=${oracleAddress}`
      );
    } else {
      envContent += `\nWDK_ZK_ORACLE_ADDRESS=${oracleAddress}\n`;
    }
    
    fs.writeFileSync(envPath, envContent);
    logger.info(`✅ Updated .env with new oracle address`);
  } else {
    logger.warn(`⚠️  .env file not found at ${envPath}`);
    logger.info(`   Add this to your .env: WDK_ZK_ORACLE_ADDRESS=${oracleAddress}`);
  }

  logger.info("\n========================================");
  logger.info("   DEPLOYMENT COMPLETE");
  logger.info("========================================");
  logger.info(`\nZKRiskOracle Address: ${oracleAddress}`);
  logger.info(`\nExplorer: https://testnet.bscscan.com/address/${oracleAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(error);
    process.exit(1);
  });

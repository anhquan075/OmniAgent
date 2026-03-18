import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../src/utils/logger';

(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

dotenv.config({ path: '.env', override: true });

async function main() {
  logger.info("Checking contract deployments...");

  const rpcUrl = "http://127.0.0.1:8545";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Check OmniAgentVault
  const vaultAddr = process.env.WDK_VAULT_ADDRESS!;
  logger.info(`\nChecking OmniAgentVault at ${vaultAddr}`);
  const vaultCode = await provider.getCode(vaultAddr);
  logger.info(`Code length: ${vaultCode.length} bytes`);
  
  if (vaultCode === '0x') {
    logger.error("OmniAgentVault contract not deployed!");
  } else {
    logger.info("OmniAgentVault contract exists");
    
    // Try to call balanceOf
    try {
      const vault = new ethers.Contract(vaultAddr, ['function balanceOf(address) view returns (uint256)'], provider);
      const testBalance = await vault.balanceOf('0x0000000000000000000000000000000000000000');
      logger.info(`balanceOf(0x00...00): ${testBalance.toString()}`);
    } catch (e: any) {
      logger.error(`balanceOf failed: ${e.message}`);
    }
    
    // Try to call bufferStatus
    try {
      const vault = new ethers.Contract(vaultAddr, ['function bufferStatus() view returns (uint256, uint256, uint256)'], provider);
      const status = await vault.bufferStatus();
      logger.info(`bufferStatus: current=${status[0].toString()}, target=${status[1].toString()}, util=${status[2].toString()}`);
    } catch (e: any) {
      logger.error(`bufferStatus failed: ${e.message}`);
    }
  }

  // Check StrategyEngine
  const engineAddr = process.env.WDK_ENGINE_ADDRESS!;
  logger.info(`\nChecking StrategyEngine at ${engineAddr}`);
  const engineCode = await provider.getCode(engineAddr);
  logger.info(`Code length: ${engineCode.length} bytes`);
  
  if (engineCode === '0x') {
    logger.error("StrategyEngine contract not deployed!");
  } else {
    logger.info("StrategyEngine contract exists");
    
    // Try to call getHealthFactor
    try {
      const engine = new ethers.Contract(engineAddr, ['function getHealthFactor() view returns (uint256)'], provider);
      const healthFactor = await engine.getHealthFactor();
      logger.info(`getHealthFactor: ${healthFactor.toString()}`);
    } catch (e: any) {
      logger.error(`getHealthFactor failed: ${e.message}`);
    }
    
    // Try to call previewDecision
    try {
      const engine = new ethers.Contract(engineAddr, ['function previewDecision() view returns (uint256, uint256, uint256, uint256)'], provider);
      const preview = await engine.previewDecision();
      logger.info(`previewDecision: nextState=${preview[0].toString()}, price=${preview[1].toString()}, timestamp=${preview[2].toString()}, cycleNumber=${preview[3].toString()}`);
    } catch (e: any) {
      logger.error(`previewDecision failed: ${e.message}`);
    }
  }
}

main().catch((err) => {
  logger.error(err, '[CheckContracts] Failed');
  process.exit(1);
});

import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../src/utils/logger';

(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

dotenv.config({ path: '.env', override: true });

async function main() {
    logger.info("Initializing WDK Adapters...");

    const rpcUrl = "http://127.0.0.1:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    const [deployer] = await ethers.getSigners();
    logger.info(`Deployer: ${deployer.address}`);

    const vaultAddr = process.env.WDK_VAULT_ADDRESS!;
    const engineAddr = process.env.WDK_ENGINE_ADDRESS!;
    const aaveAdapterAddr = process.env.WDK_AAVE_ADAPTER_ADDRESS!;
    const lzAdapterAddr = process.env.WDK_LZ_ADAPTER_ADDRESS!;

    logger.info(`Vault: ${vaultAddr}`);
    logger.info(`Engine: ${engineAddr}`);
    logger.info(`Aave Adapter: ${aaveAdapterAddr}`);
    logger.info(`LZ Adapter: ${lzAdapterAddr}`);

    // Set vault on Aave adapter
    logger.info("\n[1/2] Setting vault on Aave adapter...");
    const aaveAdapter = await ethers.getContractAt("AaveLendingAdapter", aaveAdapterAddr, deployer);
    const aaveTx = await aaveAdapter.setVault(vaultAddr);
    await aaveTx.wait();
    logger.info("Aave adapter vault set successfully");

    // Set vault on LZ adapter
    logger.info("\n[2/2] Setting vault on LZ adapter...");
    const lzAdapter = await ethers.getContractAt("LayerZeroBridgeReceiver", lzAdapterAddr, deployer);
    const lzTx = await lzAdapter.setVault(vaultAddr);
    await lzTx.wait();
    logger.info("LZ adapter vault set successfully");

    // Set engine on vault
    logger.info("\n[3/3] Setting engine on vault...");
    const vault = await ethers.getContractAt("WDKVault", vaultAddr, deployer);
    const vaultTx = await vault.setEngine(engineAddr);
    await vaultTx.wait();
    logger.info("Vault engine set successfully");

    logger.info("\nInitialization complete!");
}

main().catch((err) => {
    logger.error(err, '[InitAdapters] Failed');
    process.exit(1);
});

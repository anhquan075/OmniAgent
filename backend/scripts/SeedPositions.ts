import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

dotenv.config({ path: '.env', override: true });

async function main() {
    console.log("Seeding Position Data for MCP Tools...");
    
    const [deployer] = await ethers.getSigners();
    console.log(`Deployer: ${deployer.address}`);
    
    const vaultAddr = process.env.WDK_VAULT_ADDRESS!;
    const usdtAddr = process.env.WDK_USDT_ADDRESS!;
    const aaveAdapterAddr = process.env.WDK_AAVE_ADAPTER_ADDRESS!;
    const lzAdapterAddr = process.env.WDK_LZ_ADAPTER_ADDRESS!;
    
    const usdt = await ethers.getContractAt('MockERC20', usdtAddr, deployer);
    
    console.log(`\nVault: ${vaultAddr}`);
    console.log(`USDT: ${usdtAddr}`);
    console.log(`Aave Adapter: ${aaveAdapterAddr}`);
    console.log(`LZ Adapter: ${lzAdapterAddr}`);
    
    const seedAmount = ethers.parseUnits('1000', 6);
    
    console.log(`\n--- Seeding Aave Adapter ---`);
    console.log(`Seeding ${ethers.formatUnits(seedAmount, 6)} USDT to Aave adapter...`);
    await (await usdt.transfer(aaveAdapterAddr, seedAmount)).wait();
    console.log(`Seeded Aave adapter`);
    
    console.log(`\n--- Seeding LayerZero Adapter ---`);
    console.log(`Seeding ${ethers.formatUnits(seedAmount, 6)} USDT to LZ adapter...`);
    await (await usdt.transfer(lzAdapterAddr, seedAmount)).wait();
    console.log(`Seeded LZ adapter`);
    
    console.log(`\n========================================`);
    console.log("   POSITION DATA SEEDED SUCCESSFULLY");
    console.log("========================================");
    
    console.log(`\n========================================`);
    console.log("   POSITION DATA SEEDED SUCCESSFULLY");
    console.log("========================================");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

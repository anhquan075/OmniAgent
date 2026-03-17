import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

dotenv.config({ path: '.env', override: true });

async function main() {
    console.log("Deploying fresh WDK Adapters...");
    
    const rpcUrl = "http://127.0.0.1:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    const [deployer] = await ethers.getSigners();
    console.log(`Deployer: ${deployer.address}`);
    
    const vaultAddr = process.env.WDK_VAULT_ADDRESS!;
    const usdtAddr = process.env.WDK_USDT_ADDRESS!;
    
    console.log(`Vault: ${vaultAddr}`);
    console.log(`USDT: ${usdtAddr}`);
    
    console.log("\n--- Mock Aave Pool ---");
    const MockAavePool = await ethers.getContractFactory("MockAavePool");
    const aavePool = await (await MockAavePool.deploy(usdtAddr, usdtAddr)).waitForDeployment();
    const aavePoolAddr = await aavePool.getAddress();
    console.log(`MockAavePool: ${aavePoolAddr}`);
    
    console.log("\n--- Aave Adapter ---");
    const AaveLendingAdapter = await ethers.getContractFactory("AaveLendingAdapter");
    const aaveAdapter = await (await AaveLendingAdapter.deploy(
        usdtAddr, 
        usdtAddr, 
        aavePoolAddr, 
        deployer.address
    )).waitForDeployment();
    const aaveAdapterAddr = await aaveAdapter.getAddress();
    console.log(`AaveLendingAdapter: ${aaveAdapterAddr}`);
    
    console.log("\n--- LayerZero Adapter ---");
    const LayerZeroBridgeReceiver = await ethers.getContractFactory("LayerZeroBridgeReceiver");
    const lzEndpoint = "0x000000000000000000000000000000000000Ce17"; 
    const lzAdapter = await (await LayerZeroBridgeReceiver.deploy(
        usdtAddr,
        lzEndpoint,
        deployer.address
    )).waitForDeployment();
    const lzAdapterAddr = await lzAdapter.getAddress();
    console.log(`LayerZeroBridgeReceiver: ${lzAdapterAddr}`);
    
    console.log("\n--- Wiring Adapters ---");
    const aaveTx = await aaveAdapter.setVault(vaultAddr);
    await aaveTx.wait();
    console.log("Aave adapter vault set");
    
    const lzTx = await lzAdapter.setVault(vaultAddr);
    await lzTx.wait();
    console.log("LZ adapter vault set");
    
    let envContent = '';
    if (fs.existsSync(localEnv)) {
        envContent = fs.readFileSync(localEnv, 'utf-8');
    }
    
    const lines = envContent.split('\n');
    const newLines: string[] = [];
    let hasAave = false;
    let hasLz = false;
    
    for (const line of lines) {
        if (line.startsWith('WDK_AAVE_ADAPTER_ADDRESS=')) {
            newLines.push(`WDK_AAVE_ADAPTER_ADDRESS=${aaveAdapterAddr}`);
            hasAave = true;
        } else if (line.startsWith('WDK_LZ_ADAPTER_ADDRESS=')) {
            newLines.push(`WDK_LZ_ADAPTER_ADDRESS=${lzAdapterAddr}`);
            hasLz = true;
        } else if (line.trim()) {
            newLines.push(line);
        }
    }
    
    if (!hasAave) newLines.push(`WDK_AAVE_ADAPTER_ADDRESS=${aaveAdapterAddr}`);
    if (!hasLz) newLines.push(`WDK_LZ_ADAPTER_ADDRESS=${lzAdapterAddr}`);
    
    fs.writeFileSync(localEnv, newLines.join('\n') + '\n');
    console.log("\nEnvironment updated!");
    
    console.log("\n========================================");
    console.log("   ADAPTERS DEPLOYED SUCCESSFULLY");
    console.log("========================================");
    console.log(`WDK_AAVE_ADAPTER_ADDRESS=${aaveAdapterAddr}`);
    console.log(`WDK_LZ_ADAPTER_ADDRESS=${lzAdapterAddr}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

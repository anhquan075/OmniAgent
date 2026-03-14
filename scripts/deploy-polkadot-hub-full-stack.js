const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Polkadot Hub FRESH Deployment with account:", deployer.address);

    const addressesPath = path.join(__dirname, "../frontend/lib/polkadotHubAddresses.json");
    let existing = { contracts: {} };
    const addrs = {}; // Start fresh for high-level components

    const getOrDeploy = async (name, factory, args = [], force = false) => {
        if (addrs[name] && !force) {
            console.log(`Reusing ${name}: ${addrs[name]}`);
            return await ethers.getContractAt(factory, addrs[name]);
        }
        console.log(`Deploying ${name}...`);
        const Factory = await ethers.getContractFactory(factory);
        const contract = await Factory.deploy(...args);
        await contract.waitForDeployment();
        const addr = await contract.getAddress();
        console.log(`  ${name} deployed to: ${addr}`);
        addrs[name] = addr;
        return contract;
    };

    // 1. Mocks (Fresh deploy to reset balances)
    const usdc = await getOrDeploy("usdc", "MockUSDC", [], true);
    const glint = await getOrDeploy("glint", "MockGLINTToken", [], true);
    const mockChainlink = await getOrDeploy("mockChainlink", "MockChainlinkAggregator", [8, 100000000], true);
    const mockStableSwap = await getOrDeploy("stableSwap", "MockStableSwapPool", [await usdc.getAddress(), await usdc.getAddress(), ethers.parseUnits("1000000", 6), ethers.parseUnits("1000000", 6), ethers.parseUnits("1", 18), 4], true);
    const moonwellVault = await getOrDeploy("moonwellVault", "MockMoonwellVault", [await usdc.getAddress()], true);
    const mToken = await getOrDeploy("mToken", "MockMToken", [await usdc.getAddress(), "Moonwell USDC", "mUSDC", 8], true);
    const masterChef = await getOrDeploy("masterChef", "MockMasterChef", [await glint.getAddress()], true);
    const router = await getOrDeploy("router", "MockPancakeRouter", [], true);

    // 2. Core Stack
    console.log("\n--- Core Stack ---");
    const oracle = await getOrDeploy("oracle", "MoonwellPriceOracle", [await mockChainlink.getAddress(), 86400], true);
    const breaker = await getOrDeploy("breaker", "CircuitBreaker", [await mockChainlink.getAddress(), await mockStableSwap.getAddress(), 500, 500, 500, 3600, 86400], true);
    const policy = await getOrDeploy("policy", "RiskPolicy", [3600, 200, 500, 95000000, 100, 200, 7000, 8000, 9000, 50, 1800, 500, 10, 100, 2000, 1000, 500], true);
    const sharpeTracker = await getOrDeploy("sharpeTracker", "SharpeTracker", [10], true);

    const vault = await getOrDeploy("vault", "ProofVault", [await usdc.getAddress(), "AsterPilot Polkadot Hub Vault", "apUSDC", deployer.address, 500], true);
    const strategy = await getOrDeploy("strategyEngine", "StrategyEngine", [await vault.getAddress(), await policy.getAddress(), await oracle.getAddress(), await breaker.getAddress(), await sharpeTracker.getAddress(), 100000000], true);

    console.log("\n--- Configuring Links ---");
    await (await vault.setEngine(await strategy.getAddress())).wait();
    await (await sharpeTracker.setEngine(await strategy.getAddress())).wait();
    
    const messenger = await getOrDeploy("xcmMessenger", "CrossChainMessenger", [deployer.address], true);
    await (await strategy.setXcmMessenger(await messenger.getAddress())).wait();
    await (await breaker.setXcmMessenger(await messenger.getAddress())).wait();

    // Adapters
    console.log("\n--- Adapters ---");
    const moonwellERC4626Adapter = await getOrDeploy("moonwellERC4626Adapter", "MoonwellERC4626Adapter", [await usdc.getAddress(), await moonwellVault.getAddress(), deployer.address], true);
    const moonwellLendingAdapter = await getOrDeploy("moonwellLendingAdapter", "MoonwellLendingAdapter", [await usdc.getAddress(), await mToken.getAddress(), deployer.address], true);
    const beamSwapFarmAdapter = await getOrDeploy("beamSwapFarmAdapter", "BeamSwapFarmAdapter", [await usdc.getAddress(), await mockStableSwap.getAddress(), await masterChef.getAddress(), await router.getAddress(), await glint.getAddress(), 0, 0, deployer.address], true);

    console.log("Setting vault adapters...");
    await (await vault.setAdapters(await moonwellERC4626Adapter.getAddress(), await moonwellLendingAdapter.getAddress(), await beamSwapFarmAdapter.getAddress())).wait();

    console.log("Wiring Adapters...");
    await (await moonwellERC4626Adapter.setVault(await vault.getAddress())).wait();
    await (await moonwellERC4626Adapter.lockConfiguration()).wait();
    await (await beamSwapFarmAdapter.setVault(await vault.getAddress())).wait();
    await (await beamSwapFarmAdapter.lockConfiguration()).wait();
    await (await moonwellLendingAdapter.setVault(await vault.getAddress())).wait();
    await (await moonwellLendingAdapter.lockConfiguration()).wait();

    console.log("Finalizing vault configuration...");
    await (await vault.lockConfiguration()).wait();

    fs.writeFileSync(addressesPath, JSON.stringify({ network: "polkadotHubTestnet", timestamp: new Date().toISOString(), contracts: addrs }, null, 2));
    console.log("\nFRESH Deployment Complete! ✅");
}

main().catch(console.error);

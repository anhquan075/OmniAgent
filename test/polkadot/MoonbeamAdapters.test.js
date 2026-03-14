const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Polkadot Hub Adapters Test Suite", function () {
    let deployer, vault, usdc, moonwellVault, mToken, mockStableSwap, masterChef, glint;
    let moonwellPriceOracle, moonwellLendingAdapter, moonwellERC4626Adapter, beamSwapStableAdapter, beamSwapFarmAdapter;

    beforeEach(async function () {
        [deployer, vault] = await ethers.getSigners();

        // 1. Deploy Mocks
        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        usdc = await MockUSDC.deploy();
        const usdcAddress = await usdc.getAddress();

        const MockGLINT = await ethers.getContractFactory("MockGLINTToken");
        glint = await MockGLINT.deploy();
        const glintAddress = await glint.getAddress();

        const MockChainlink = await ethers.getContractFactory("MockChainlinkAggregator");
        const mockChainlink = await MockChainlink.deploy(8, 100000000); // $1.00
        const mockChainlinkAddress = await mockChainlink.getAddress();

        const MockStableSwap = await ethers.getContractFactory("MockStableSwapPool");
        mockStableSwap = await MockStableSwap.deploy(
            usdcAddress, usdcAddress, 
            ethers.parseUnits("1000000", 6), ethers.parseUnits("1000000", 6), 
            ethers.parseUnits("1", 18), 4
        );
        const mockStableSwapAddress = await mockStableSwap.getAddress();

        const MockMoonwellVault = await ethers.getContractFactory("MockMoonwellVault");
        moonwellVault = await MockMoonwellVault.deploy(usdcAddress);
        const moonwellVaultAddress = await moonwellVault.getAddress();

        const MockMToken = await ethers.getContractFactory("MockMToken");
        mToken = await MockMToken.deploy(usdcAddress, "mUSDC", "mUSDC", 8);
        const mTokenAddress = await mToken.getAddress();

        const MockMasterChef = await ethers.getContractFactory("MockMasterChef");
        masterChef = await MockMasterChef.deploy(glintAddress);
        const masterChefAddress = await masterChef.getAddress();
        await masterChef.addPool(mockStableSwapAddress);

        // 2. Deploy Adapters
        const MoonwellPriceOracle = await ethers.getContractFactory("MoonwellPriceOracle");
        moonwellPriceOracle = await MoonwellPriceOracle.deploy(mockChainlinkAddress, 86400);

        const MoonwellLendingAdapter = await ethers.getContractFactory("MoonwellLendingAdapter");
        moonwellLendingAdapter = await MoonwellLendingAdapter.deploy(usdcAddress, mTokenAddress, deployer.address);
        await moonwellLendingAdapter.setVault(vault.address);

        const MoonwellERC4626Adapter = await ethers.getContractFactory("MoonwellERC4626Adapter");
        moonwellERC4626Adapter = await MoonwellERC4626Adapter.deploy(usdcAddress, moonwellVaultAddress, deployer.address);
        await moonwellERC4626Adapter.setVault(vault.address);

        const BeamSwapStableAdapter = await ethers.getContractFactory("BeamSwapStableAdapter");
        beamSwapStableAdapter = await BeamSwapStableAdapter.deploy(mockStableSwapAddress, usdcAddress, usdcAddress, deployer.address);

        const BeamSwapFarmAdapter = await ethers.getContractFactory("BeamSwapFarmAdapter");
        beamSwapFarmAdapter = await BeamSwapFarmAdapter.deploy(
            usdcAddress, mockStableSwapAddress, masterChefAddress, glintAddress, 0, 0, deployer.address
        );
        await beamSwapFarmAdapter.setVault(vault.address);

        // 3. Setup Approvals (Vault normally does this)
        await usdc.connect(vault).approve(moonwellLendingAdapter.getAddress(), ethers.MaxUint256);
        await usdc.connect(vault).approve(moonwellERC4626Adapter.getAddress(), ethers.MaxUint256);
        await usdc.connect(vault).approve(beamSwapFarmAdapter.getAddress(), ethers.MaxUint256);
    });

    describe("1. MoonwellPriceOracle", function () {
        it("should fetch price from Chainlink feed", async function () {
            const price = await moonwellPriceOracle.getPrice();
            expect(price).to.equal(100000000n);
        });
    });

    describe("2. MoonwellLendingAdapter", function () {
        it("should deposit USDC and mint mTokens", async function () {
            const amount = ethers.parseUnits("1000", 6);
            await usdc.mint(vault.address, amount);
            await moonwellLendingAdapter.connect(vault).onVaultDeposit(amount);
            
            // Initial exchange rate is 0.02 * 1e18
            // underlying = (mBalance * exchangeRate) / 1e18 / 10^8
            // 1000 * 10^6 = (mBalance * 2e16) / 1e18 / 10^8
            // mBalance = 1000 * 10^6 * 1e18 * 10^8 / 2e16 = 1000 * 10^24 / 2e16 = 500 * 10^8 = 5e10
            expect(await mToken.balanceOf(moonwellLendingAdapter.getAddress())).to.be.gt(0);
        });

        it("should calculate managedAssets correctly", async function () {
            const amount = ethers.parseUnits("1000", 6);
            await usdc.mint(vault.address, amount);
            await moonwellLendingAdapter.connect(vault).onVaultDeposit(amount);
            
            expect(await moonwellLendingAdapter.managedAssets()).to.equal(amount);
        });
    });

    describe("3. MoonwellERC4626Adapter (Synchronous)", function () {
        it("should deposit USDC synchronously", async function () {
            const amount = ethers.parseUnits("1000", 6);
            await usdc.mint(vault.address, amount);
            await moonwellERC4626Adapter.connect(vault).onVaultDeposit(amount);
            
            expect(await moonwellERC4626Adapter.managedAssets()).to.equal(amount);
        });
    });

    describe("4. BeamSwapStableAdapter", function () {
        it("should get pool virtual price", async function () {
            expect(await beamSwapStableAdapter.getVirtualPrice()).to.equal(ethers.parseUnits("1", 18));
        });
    });

    describe("5. BeamSwapFarmAdapter", function () {
        it("should add liquidity and stake LP tokens", async function () {
            const amount = ethers.parseUnits("1000", 6);
            await usdc.mint(vault.address, amount);
            // Allow adapter to pull from vault
            await usdc.connect(vault).approve(beamSwapFarmAdapter.getAddress(), amount);
            await beamSwapFarmAdapter.connect(vault).onVaultDeposit(amount);
            
            expect(await beamSwapFarmAdapter.managedAssets()).to.be.gt(0);
        });
    });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Polkadot Hub Full Cycle Integration", function () {
    let vault, engine, breaker, oracle, policy, sharpeTracker;
    let moonwellAdapter, moonwellLendingAdapter, beamSwapFarmAdapter;
    let usdc, glint, moonwellVault, mToken, mockChainlink, mockStableSwap, masterChef;
    let deployer, alice, bob;

    const BPS_DENOMINATOR = 10000;

    beforeEach(async function () {
        [deployer, alice, bob] = await ethers.getSigners();

        // 1. Deploy Mocks
        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        usdc = await MockUSDC.deploy();
        const usdcAddress = await usdc.getAddress();

        const MockGLINT = await ethers.getContractFactory("MockGLINTToken");
        glint = await MockGLINT.deploy();
        const glintAddress = await glint.getAddress();

        const MockChainlink = await ethers.getContractFactory("MockChainlinkAggregator");
        mockChainlink = await MockChainlink.deploy(8, 100000000); // $1.00
        const mockChainlinkAddress = await mockChainlink.getAddress();

        const MockStableSwap = await ethers.getContractFactory("MockStableSwapPool");
        mockStableSwap = await MockStableSwap.deploy(
            usdcAddress, 
            usdcAddress, 
            ethers.parseUnits("1000000", 6), 
            ethers.parseUnits("1000000", 6), 
            ethers.parseUnits("1", 18), 
            4
        );
        const mockStableSwapAddress = await mockStableSwap.getAddress();

        const MockMoonwellVault = await ethers.getContractFactory("MockMoonwellVault");
        moonwellVault = await MockMoonwellVault.deploy(usdcAddress);
        const moonwellVaultAddress = await moonwellVault.getAddress();

        const MockMToken = await ethers.getContractFactory("MockMToken");
        mToken = await MockMToken.deploy(usdcAddress, "Moonwell USDC", "mUSDC", 8);
        const mTokenAddress = await mToken.getAddress();

        const MockMasterChef = await ethers.getContractFactory("MockMasterChef");
        masterChef = await MockMasterChef.deploy(glintAddress);
        const masterChefAddress = await masterChef.getAddress();
        await masterChef.addPool(mockStableSwapAddress);

        // 2. Deploy Infra
        const MoonwellPriceOracle = await ethers.getContractFactory("MoonwellPriceOracle");
        oracle = await MoonwellPriceOracle.deploy(mockChainlinkAddress, 86400);
        const oracleAddress = await oracle.getAddress();

        const CircuitBreaker = await ethers.getContractFactory("CircuitBreaker");
        breaker = await CircuitBreaker.deploy(
            mockChainlinkAddress,
            mockStableSwapAddress,
            200, 500, 1000, 3600, 86400
        );
        const breakerAddress = await breaker.getAddress();

        const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
        policy = await RiskPolicy.deploy(
            3600, 200, 500, 95000000, 100, 200,
            7000, 8000, 9000, // Aster bps
            50, 1800, 500, 10, 100,
            2000, 1000, 500  // LP bps
        );
        const policyAddress = await policy.getAddress();

        const SharpeTracker = await ethers.getContractFactory("SharpeTracker");
        sharpeTracker = await SharpeTracker.deploy(10);
        const sharpeTrackerAddress = await sharpeTracker.getAddress();

        const ProofVault = await ethers.getContractFactory("ProofVault");
        vault = await ProofVault.deploy(usdcAddress, "Vault", "apUSDC", deployer.address, 500);
        const vaultAddress = await vault.getAddress();

        const StrategyEngine = await ethers.getContractFactory("StrategyEngine");
        engine = await StrategyEngine.deploy(
            vaultAddress, policyAddress, oracleAddress, breakerAddress, sharpeTrackerAddress, 100000000
        );
        const engineAddress = await engine.getAddress();

        await vault.setEngine(engineAddress);

        // 3. Deploy Adapters
        const MoonwellERC4626Adapter = await ethers.getContractFactory("MoonwellERC4626Adapter");
        moonwellAdapter = await MoonwellERC4626Adapter.deploy(usdcAddress, moonwellVaultAddress, deployer.address);
        const moonwellAdapterAddress = await moonwellAdapter.getAddress();

        const MoonwellLendingAdapter = await ethers.getContractFactory("MoonwellLendingAdapter");
        moonwellLendingAdapter = await MoonwellLendingAdapter.deploy(usdcAddress, mTokenAddress, deployer.address);
        const moonwellLendingAdapterAddress = await moonwellLendingAdapter.getAddress();

        const BeamSwapFarmAdapter = await ethers.getContractFactory("BeamSwapFarmAdapter");
        beamSwapFarmAdapter = await BeamSwapFarmAdapter.deploy(
            usdcAddress,
            mockStableSwapAddress,
            masterChefAddress,
            glintAddress,
            0, // poolId
            0, // assetIndex
            deployer.address
        );
        const beamSwapFarmAdapterAddress = await beamSwapFarmAdapter.getAddress();

        // 4. Configure
        await vault.setAdapters(moonwellAdapterAddress, beamSwapFarmAdapterAddress, moonwellLendingAdapterAddress);
        
        await moonwellAdapter.setVault(vaultAddress);
        await moonwellAdapter.lockConfiguration();
        
        await beamSwapFarmAdapter.setVault(vaultAddress);
        await beamSwapFarmAdapter.lockConfiguration();

        await moonwellLendingAdapter.setVault(vaultAddress);
        await moonwellLendingAdapter.lockConfiguration();
        
        await vault.lockConfiguration();

        // 5. Seed liquidity
        await usdc.mint(mockStableSwapAddress, ethers.parseUnits("10000000", 6));
        await usdc.mint(mTokenAddress, ethers.parseUnits("10000000", 6));
        await usdc.mint(alice.address, ethers.parseUnits("1000000", 6));
    });

    it("Should complete full deposit cycle", async function () {
        const depositAmount = ethers.parseUnits("10000", 6);
        await usdc.connect(alice).approve(await vault.getAddress(), depositAmount);
        
        await vault.connect(alice).deposit(depositAmount, alice.address);
        
        expect(await vault.totalAssets()).to.equal(depositAmount);

        // Move time to allow execution
        await ethers.provider.send("evm_increaseTime", [3601]);
        await ethers.provider.send("evm_mine");

        await engine.executeCycle();

        const asterBal = await moonwellAdapter.managedAssets();
        const secBal = await beamSwapFarmAdapter.managedAssets();
        const lpBal = await moonwellLendingAdapter.managedAssets();
        
        console.log(`Aster (Moonwell ERC4626): ${ethers.formatUnits(asterBal, 6)}`);
        console.log(`Secondary (BeamSwap Farm): ${ethers.formatUnits(secBal, 6)}`);
        console.log(`LP (Moonwell Lending): ${ethers.formatUnits(lpBal, 6)}`);

        const totalAllocated = asterBal + secBal + lpBal;
        // Total = 10000. Buffer = 500 (5%). Deployable = 9500.
        // RiskPolicy: normalAsterBps = 8000, normalLpBps = 1000. Total = 9000 (90%).
        // Secondary takes the remaining 10% of deployable.
        // Bounty (max 1%) is subtracted from totalAssets during rebalance if executor is paid.
        // Expected = 9500 - bounty.
        expect(totalAllocated).to.be.closeTo(
            ethers.parseUnits("9400", 6),
            ethers.parseUnits("100", 6)
        );
    });

    it("Should activate circuit breaker on price crash", async function () {
        await mockChainlink.setRound(94000000, Math.floor(Date.now() / 1000));
        await breaker.checkBreaker();
        expect(await breaker.isPaused()).to.be.true;
        await expect(engine.executeCycle()).to.be.revertedWithCustomError(engine, "StrategyEngine__BreakerPaused");
    });
});

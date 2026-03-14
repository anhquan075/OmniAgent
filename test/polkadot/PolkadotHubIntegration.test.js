const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Polkadot Hub Integration Tests", function () {
    let deployer, user;
    let usdc, moonwellVault, beamSwapRouter;
    let vault, strategy, moonwellAdapter, circuitBreaker, mockChainlink;
    const INITIAL_RESERVE = ethers.parseUnits("100000000", 6); // 100M USDC
    const DEPOSIT_AMOUNT = ethers.parseUnits("10000000", 6); // 10M USDC

    beforeEach(async function () {
        [deployer, user] = await ethers.getSigners();

        // 1. Deploy Mocks
        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        usdc = await MockUSDC.deploy();
        
        const MockMoonwellVault = await ethers.getContractFactory("MockMoonwellVault");
        moonwellVault = await MockMoonwellVault.deploy(await usdc.getAddress());
        
        const MockBeamSwapRouter = await ethers.getContractFactory("MockBeamSwapRouter");
        beamSwapRouter = await MockBeamSwapRouter.deploy();

        // 2. Setup DEX Reserves
        await usdc.mint(deployer.address, INITIAL_RESERVE);
        await usdc.approve(await beamSwapRouter.getAddress(), INITIAL_RESERVE);
        await beamSwapRouter.addLiquidity(
            await usdc.getAddress(),
            await usdc.getAddress(),
            INITIAL_RESERVE / 2n,
            INITIAL_RESERVE / 2n
        );

        // 3. Deploy Main Vault Stack
        const ProofVault = await ethers.getContractFactory("ProofVault");
        vault = await ProofVault.deploy(
            await usdc.getAddress(), 
            "AsterPilot USDC Vault", 
            "apUSDC",
            deployer.address,
            500 // 5% idle buffer
        );
        const actualVaultAddress = await vault.getAddress();

        const MockChainlinkAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
        mockChainlink = await MockChainlinkAggregator.deploy(8, 100000000n);
        const MockStableSwapPool = await ethers.getContractFactory("MockStableSwapPool");
        const mockStableSwap = await MockStableSwapPool.deploy(
            await usdc.getAddress(), 
            await usdc.getAddress(),
            ethers.parseUnits("10000000", 6),
            ethers.parseUnits("10000000", 6),
            1000000000000000000n,
            0
        );

        const CircuitBreaker = await ethers.getContractFactory("CircuitBreaker");
        circuitBreaker = await CircuitBreaker.deploy(
            await mockChainlink.getAddress(),
            await mockStableSwap.getAddress(),
            500,
            500,
            500,
            3600,
            86400
        );
        const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
        const oracle = await MockPriceOracle.deploy(100000000n, deployer.address);

        const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
        const policy = await RiskPolicy.deploy(
            300, 200, 500, 99000000n, 100, 100,
            2000, 5000, 7000,
            5, 3600, 500, 5, 5000,
            2000, 1500, 500
        );

        const SharpeTracker = await ethers.getContractFactory("SharpeTracker");
        const sharpeTracker = await SharpeTracker.deploy(5);

        const StrategyEngine = await ethers.getContractFactory("StrategyEngine");
        strategy = await StrategyEngine.deploy(
            actualVaultAddress,
            await policy.getAddress(),
            await oracle.getAddress(),
            await circuitBreaker.getAddress(),
            await sharpeTracker.getAddress(),
            100000000n
        );
        await vault.setEngine(await strategy.getAddress());

        // 4. Deploy Adapters
        const MoonwellAdapterFactory = await ethers.getContractFactory("MoonwellERC4626Adapter");
        moonwellERC4626Adapter = await MoonwellAdapterFactory.deploy(
            await usdc.getAddress(),
            await moonwellVault.getAddress(),
            deployer.address
        );
        await moonwellERC4626Adapter.setVault(actualVaultAddress);
        
        const MoonwellLendingAdapterFactory = await ethers.getContractFactory("MoonwellLendingAdapter");
        const MockMToken = await ethers.getContractFactory("MockMToken");
        const mToken = await MockMToken.deploy(await usdc.getAddress(), "mUSDC", "mUSDC", 6);
        
        moonwellLendingAdapter = await MoonwellLendingAdapterFactory.deploy(
            await usdc.getAddress(),
            await mToken.getAddress(),
            deployer.address
        );
        await moonwellLendingAdapter.setVault(actualVaultAddress);

        const BeamSwapFarmAdapterFactory = await ethers.getContractFactory("BeamSwapFarmAdapter");
        const MockMasterChef = await ethers.getContractFactory("MockMasterChef");
        const MockGLINT = await ethers.getContractFactory("MockGLINTToken");
        const glint = await MockGLINT.deploy();
        const masterChef = await MockMasterChef.deploy(await glint.getAddress());
        await masterChef.addPool(await mockStableSwap.getAddress());

        beamSwapFarmAdapter = await BeamSwapFarmAdapterFactory.deploy(
            await usdc.getAddress(),
            await mockStableSwap.getAddress(),
            await masterChef.getAddress(),
            await glint.getAddress(),
            0,
            0,
            deployer.address
        );
        await beamSwapFarmAdapter.setVault(actualVaultAddress);

        // 5. Configure Strategy
        await vault.setAdapters(
            await moonwellERC4626Adapter.getAddress(),
            await beamSwapFarmAdapter.getAddress(), // secondary
            await moonwellLendingAdapter.getAddress()  // lp
        );

        // Give user funds
        await usdc.mint(user.address, DEPOSIT_AMOUNT);
        await usdc.connect(user).approve(actualVaultAddress, ethers.MaxUint256);
        await vault.lockConfiguration();
    });

    describe("Full Cycle", function () {
        it("should accept deposits and execute cycle", async function () {
            // Deposit
            await vault.connect(user).deposit(DEPOSIT_AMOUNT, user.address);
            expect(await vault.totalAssets()).to.equal(DEPOSIT_AMOUNT);

            // Move time to allow execution
            await ethers.provider.send("evm_increaseTime", [301]);
            await ethers.provider.send("evm_mine");

            // Execute cycle (allocate to adapters)
            const tx = await strategy.executeCycle();
            const receipt = await tx.wait();

            // Gas Optimization check: Verify gas < 1M (Polkadot Hub has higher base costs)
            console.log(`Gas used for executeCycle: ${receipt.gasUsed.toString()}`);
            expect(receipt.gasUsed).to.be.lt(1000000n);

            // Verify funds were moved to adapters
            const vaultBalance = await usdc.balanceOf(await vault.getAddress());
            expect(vaultBalance).to.be.lt(DEPOSIT_AMOUNT); // Some funds moved

            // Simulate yield
            await moonwellVault.simulateYield();

            // Ensure adapters have enough tokens for the pull (simulating they earned or have liquidity)
            // The mock contracts itself must have the underlying tokens
            await usdc.mint(await moonwellVault.getAddress(), DEPOSIT_AMOUNT * 100n);
            const mTokenAddr = await moonwellLendingAdapter.mToken();
            await usdc.mint(mTokenAddr, DEPOSIT_AMOUNT * 100n);

            // Redeem all shares
            const shares = await vault.balanceOf(user.address);
            await vault.connect(user).redeem(shares, user.address, user.address);
            
            // User should have original amount (or slightly more from yield simulation)
            const userBalance = await usdc.balanceOf(user.address);
            expect(userBalance).to.be.gte(DEPOSIT_AMOUNT);
        });
    });

    describe("Circuit Breaker", function () {
        it("should trigger on extreme conditions", async function () {
            // Drop price significantly from 1.0 to 0.90 to simulate crash
            await mockChainlink.setRound(90000000n, Math.floor(Date.now() / 1000));
            
            // Need to call checkBreaker first to update state
            await circuitBreaker.checkBreaker();
            expect(await circuitBreaker.isPaused()).to.be.true;

            // Execute cycle should be blocked
            await expect(
                strategy.connect(user).executeCycle()
            ).to.be.revertedWithCustomError(strategy, "StrategyEngine__BreakerPaused");
        });
    });
});

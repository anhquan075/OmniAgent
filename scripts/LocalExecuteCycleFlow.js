const { ethers } = require("hardhat");

async function main() {
  const [deployer, user, executor] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdt = await MockERC20.deploy("USDT", "USDT");
  const usdf = await MockERC20.deploy("USDF", "USDF");
  const cake = await MockERC20.deploy("CAKE", "CAKE");

  const MockChainlinkAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
  const chainlinkFeed = await MockChainlinkAggregator.deploy(8, 100000000n);

  const MockStableSwapPoolWithLPSupport = await ethers.getContractFactory("MockStableSwapPoolWithLPSupport");
  const stableSwapPool = await MockStableSwapPoolWithLPSupport.deploy(
    usdf.target,
    usdt.target,
    ethers.parseUnits("10000000", 18),
    ethers.parseUnits("10000000", 18),
    ethers.parseUnits("1", 18),
    4
  );

  const MockPancakeRouter = await ethers.getContractFactory("MockPancakeRouter");
  const pancakeRouter = await MockPancakeRouter.deploy();
  await pancakeRouter.setReserves(
    cake.target,
    usdt.target,
    ethers.parseUnits("1000000", 18),
    ethers.parseUnits("500000", 18)
  );
  await pancakeRouter.setReserves(
    usdt.target,
    usdf.target,
    ethers.parseUnits("10000000", 18),
    ethers.parseUnits("10000000", 18)
  );

  const MockMasterChef = await ethers.getContractFactory("MockMasterChef");
  const masterChef = await MockMasterChef.deploy(cake.target);
  const poolId = 0;
  await masterChef.addPool(stableSwapPool.target);

  const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
  const oracle = await MockPriceOracle.deploy(100000000n, deployer.address);

  const MockAsyncAsterMinter = await ethers.getContractFactory("MockAsyncAsterMinter");
  const asterMinter = await MockAsyncAsterMinter.deploy(usdf.target, 3600);

  const RiskPolicy = await ethers.getContractFactory("RiskPolicy");
  const policy = await RiskPolicy.deploy(
    300,
    200,
    500,
    99000000n,
    200,
    100,
    2000,
    5000,
    7000,
    5,
    3600,
    500,
    5,
    5000,
    2000,
    1500,
    500
  );

  const CircuitBreaker = await ethers.getContractFactory("CircuitBreaker");
  const breaker = await CircuitBreaker.deploy(
    chainlinkFeed.target,
    stableSwapPool.target,
    50,
    100,
    50,
    3600,
    86400
  );

  const SharpeTracker = await ethers.getContractFactory("SharpeTracker");
  const sharpeTracker = await SharpeTracker.deploy(5);

  const depositSel = asterMinter.interface.getFunction("deposit").selector;
  const managedAssetsSel = asterMinter.interface.getFunction("managedAssets").selector;
  const requestWithdrawSel = asterMinter.interface.getFunction("requestWithdraw").selector;
  const claimWithdrawSel = asterMinter.interface.getFunction("claimWithdraw").selector;
  const getWithdrawRequestSel = asterMinter.interface.getFunction("getWithdrawRequest").selector;

  const AsterEarnAdapterWithSwap = await ethers.getContractFactory("AsterEarnAdapterWithSwap");
  const asterAdapter = await AsterEarnAdapterWithSwap.deploy(
    usdt.target,
    usdf.target,
    asterMinter.target,
    depositSel,
    managedAssetsSel,
    requestWithdrawSel,
    claimWithdrawSel,
    getWithdrawRequestSel,
    pancakeRouter.target,
    deployer.address
  );

  const ManagedAdapter = await ethers.getContractFactory("ManagedAdapter");
  const secondaryAdapter = await ManagedAdapter.deploy(usdt.target, deployer.address);

  const StableSwapLPYieldAdapterWithFarm = await ethers.getContractFactory("StableSwapLPYieldAdapterWithFarm");
  const lpAdapter = await StableSwapLPYieldAdapterWithFarm.deploy(
    usdt.target,
    stableSwapPool.target,
    cake.target,
    deployer.address,
    stableSwapPool.target,
    masterChef.target,
    pancakeRouter.target,
    poolId,
    deployer.address
  );

  const ProofVault = await ethers.getContractFactory("ProofVault");
  const vault = await ProofVault.deploy(usdt.target, "ProofVault Local Flow", "pvLOCAL", deployer.address, 500);

  const StrategyEngine = await ethers.getContractFactory("StrategyEngine");
  const engine = await StrategyEngine.deploy(
    vault.target,
    policy.target,
    oracle.target,
    breaker.target,
    sharpeTracker.target,
    100000000n
  );

  await vault.setEngine(engine.target);
  await sharpeTracker.setEngine(engine.target);
  await vault.setAdapters(asterAdapter.target, secondaryAdapter.target, lpAdapter.target);
  await asterAdapter.setVault(vault.target);
  await secondaryAdapter.setVault(vault.target);
  await lpAdapter.setVault(vault.target);

  await asterAdapter.lockConfiguration();
  await secondaryAdapter.lockConfiguration();
  await lpAdapter.lockConfiguration();
  await vault.lockConfiguration();

  await usdt.mint(user.address, ethers.parseUnits("200000", 18));
  await usdt.mint(stableSwapPool.target, ethers.parseUnits("5000000", 18));
  await usdf.mint(stableSwapPool.target, ethers.parseUnits("5000000", 18));
  await usdf.mint(pancakeRouter.target, ethers.parseUnits("10000000", 18));
  await usdt.mint(pancakeRouter.target, ethers.parseUnits("10000000", 18));
  await cake.mint(masterChef.target, ethers.parseUnits("1000000", 18));
  await usdt.connect(user).approve(vault.target, ethers.MaxUint256);

  const depositAmount = ethers.parseUnits("10000", 18);
  await vault.connect(user).deposit(depositAmount, user.address);

  const cycleBefore = await engine.cycleCount();
  const canBefore = await engine.canExecute();

  await ethers.provider.send("evm_increaseTime", [301]);
  await ethers.provider.send("evm_mine", []);

  const preview = await engine.previewDecision();
  const tx = await engine.connect(executor).executeCycle();
  const receipt = await tx.wait();
  const cycleAfter = await engine.cycleCount();
  const canAfter = await engine.canExecute();
  const totalAssets = await vault.totalAssets();

  if (cycleAfter !== cycleBefore + 1n) {
    throw new Error(`cycleCount did not increment: before=${cycleBefore} after=${cycleAfter}`);
  }
  if (receipt.status !== 1) {
    throw new Error("executeCycle transaction reverted");
  }

  console.log("Local executeCycle flow OK");
  console.log("vault", vault.target);
  console.log("engine", engine.target);
  console.log("user", user.address);
  console.log("executor", executor.address);
  console.log("depositAmount", depositAmount.toString());
  console.log("preview.executable", preview.executable);
  console.log("preview.targetAsterBps", preview.targetAsterBps.toString());
  console.log("preview.targetLpBps", preview.targetLpBps.toString());
  console.log("executeTx", tx.hash);
  console.log("cycleBefore", cycleBefore.toString());
  console.log("cycleAfter", cycleAfter.toString());
  console.log("canExecuteBefore", canBefore[0], canBefore[1]);
  console.log("canExecuteAfter", canAfter[0], canAfter[1]);
  console.log("totalAssets", totalAssets.toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

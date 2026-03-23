const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("AgentStaking", function () {
  let staking;
  let usdt;
  let agentNFA;
  let sharpeTracker;
  let owner;
  let guardian;
  let operator;
  let user1;
  let user2;

  const AGENT_TOKEN_ID = 0;
  const STAKE_AMOUNT = ethers.parseUnits("1000", 6);
  const REWARD_FUND = ethers.parseUnits("100000", 6);
  const ONE_YEAR = 365 * 24 * 60 * 60;

  async function deployFixture() {
    [owner, guardian, operator, user1, user2] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdt = await MockERC20.deploy("Tether USD", "USDT");
    await usdt.waitForDeployment();
    await usdt.setDecimals(6);

    const AgentNFA = await ethers.getContractFactory("AgentNFA");
    agentNFA = await AgentNFA.deploy();
    await agentNFA.waitForDeployment();

    // Mint agent #0 (policyGuard must be non-zero)
    await agentNFA.mint(owner.address, operator.address, owner.address);

    const SharpeTracker = await ethers.getContractFactory("SharpeTracker");
    sharpeTracker = await SharpeTracker.deploy(20);
    await sharpeTracker.waitForDeployment();

    const AgentStaking = await ethers.getContractFactory("AgentStaking");
    staking = await AgentStaking.deploy(
      await usdt.getAddress(),
      await agentNFA.getAddress(),
      await sharpeTracker.getAddress(),
      guardian.address
    );
    await staking.waitForDeployment();

    // Mint USDT to users and approve
    for (const user of [user1, user2, owner]) {
      await usdt.mint(user.address, ethers.parseUnits("1000000", 6));
      await usdt.connect(user).approve(await staking.getAddress(), ethers.MaxUint256);
    }

    // Fund reward pool
    await usdt.mint(owner.address, REWARD_FUND);
    await staking.fundRewardPool(REWARD_FUND);
  }

  beforeEach(async function () {
    await deployFixture();
  });

  // ── Staking ─────────────────────────────────────────────────

  describe("stake()", function () {
    it("should stake USDT on a valid agent", async function () {
      await expect(staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT))
        .to.emit(staking, "Staked")
        .withArgs(user1.address, AGENT_TOKEN_ID, STAKE_AMOUNT);

      const info = await staking.getStakeInfo(user1.address, AGENT_TOKEN_ID);
      expect(info.stakedAmount).to.equal(STAKE_AMOUNT);
    });

    it("should update pool totals correctly", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);

      const pool = await staking.getAgentPool(AGENT_TOKEN_ID);
      expect(pool.totalStaked).to.equal(STAKE_AMOUNT);
      expect(pool.stakerCount).to.equal(1);
    });

    it("should allow multiple users to stake", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      await staking.connect(user2).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);

      const pool = await staking.getAgentPool(AGENT_TOKEN_ID);
      expect(pool.totalStaked).to.equal(STAKE_AMOUNT * 2n);
      expect(pool.stakerCount).to.equal(2);
    });

    it("should revert on zero amount", async function () {
      await expect(staking.connect(user1).stake(AGENT_TOKEN_ID, 0))
        .to.be.revertedWithCustomError(staking, "AgentStaking__ZeroAmount");
    });

    it("should revert on non-existent agent", async function () {
      await expect(staking.connect(user1).stake(999, STAKE_AMOUNT))
        .to.be.revertedWithCustomError(staking, "AgentStaking__AgentNotFound");
    });

    it("should transfer USDT from staker", async function () {
      const before = await usdt.balanceOf(user1.address);
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      const after = await usdt.balanceOf(user1.address);
      expect(before - after).to.equal(STAKE_AMOUNT);
    });

    it("should auto-claim pending rewards on re-stake", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      await time.increase(ONE_YEAR);
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      // Pending rewards should be claimed (no revert, stake succeeded)
      const info = await staking.getStakeInfo(user1.address, AGENT_TOKEN_ID);
      expect(info.stakedAmount).to.equal(STAKE_AMOUNT * 2n);
    });
  });

  // ── Unstaking ───────────────────────────────────────────────

  describe("unstake()", function () {
    beforeEach(async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
    });

    it("should return full principal after unbonding", async function () {
      const before = await usdt.balanceOf(user1.address);
      await staking.connect(user1).unstake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      const after = await usdt.balanceOf(user1.address);
      expect(after - before).to.equal(STAKE_AMOUNT);
    });

    it("should handle partial unstake", async function () {
      await staking.connect(user1).unstake(AGENT_TOKEN_ID, STAKE_AMOUNT / 2n);
      const info = await staking.getStakeInfo(user1.address, AGENT_TOKEN_ID);
      expect(info.stakedAmount).to.equal(STAKE_AMOUNT / 2n);
    });

    it("should decrement stakerCount on full unstake", async function () {
      await staking.connect(user1).unstake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      const pool = await staking.getAgentPool(AGENT_TOKEN_ID);
      expect(pool.stakerCount).to.equal(0);
    });

    it("should revert on zero amount", async function () {
      await expect(staking.connect(user1).unstake(AGENT_TOKEN_ID, 0))
        .to.be.revertedWithCustomError(staking, "AgentStaking__ZeroAmount");
    });

    it("should revert on insufficient stake", async function () {
      await expect(staking.connect(user1).unstake(AGENT_TOKEN_ID, STAKE_AMOUNT * 2n))
        .to.be.revertedWithCustomError(staking, "AgentStaking__InsufficientStake");
    });
  });

  // ── Rewards ─────────────────────────────────────────────────

  describe("Rewards", function () {
    it("should accrue time-based rewards", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      await time.increase(ONE_YEAR);

      const pending = await staking.getRewardsPending(user1.address, AGENT_TOKEN_ID);
      expect(pending).to.be.gt(0);
    });

    it("should pay rewards on unstake", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      await time.increase(ONE_YEAR);

      const before = await usdt.balanceOf(user1.address);
      await staking.connect(user1).unstake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      const after = await usdt.balanceOf(user1.address);

      expect(after).to.be.gt(before + STAKE_AMOUNT);
    });

    it("should pay zero rewards with zero time", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);

      const pending = await staking.getRewardsPending(user1.address, AGENT_TOKEN_ID);
      // With SharpeTracker returning (0,0,0) → 0.8x multiplier, but time=0 → 0 rewards
      expect(pending).to.equal(0);
    });

    it("should apply Sharpe performance multiplier", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      await time.increase(ONE_YEAR);

      const pending = await staking.getRewardsPending(user1.address, AGENT_TOKEN_ID);
      // With SharpeTracker count=0 → (0,0,0) → multiplier 8000 bps (0.8x)
      // Base APY 5% = 500 bps → 5% * 0.8 = 4% → 1000 * 0.04 = 40 USDT
      // Allow small rounding differences
      expect(pending).to.be.gte(35);
      expect(pending).to.be.lte(45);
    });
  });

  // ── Slashing ────────────────────────────────────────────────

  describe("slash()", function () {
    beforeEach(async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
    });

    it("should slash by guardian", async function () {
      await expect(staking.connect(guardian).slash(AGENT_TOKEN_ID, 1000, "Low Sharpe"))
        .to.emit(staking, "Slashed")
        .withArgs(AGENT_TOKEN_ID, 1000, "Low Sharpe");
    });

    it("should slash by owner", async function () {
      await expect(staking.connect(owner).slash(AGENT_TOKEN_ID, 1000, "Owner slash"))
        .to.emit(staking, "Slashed");
    });

    it("should slash by operator (agent owner)", async function () {
      await expect(staking.connect(operator).slash(AGENT_TOKEN_ID, 1000, "Operator slash"))
        .to.emit(staking, "Slashed");
    });

    it("should reduce pool totalStaked by slash amount", async function () {
      await staking.connect(guardian).slash(AGENT_TOKEN_ID, 1000, "Test slash");
      const pool = await staking.getAgentPool(AGENT_TOKEN_ID);
      // 1000 bps = 10% → 1000 USDT * 0.1 = 100 USDT slashed
      expect(pool.totalStaked).to.equal(STAKE_AMOUNT - (STAKE_AMOUNT * 1000n / 10000n));
    });

    it("should revert on max slash exceeded (50%)", async function () {
      await staking.connect(guardian).slash(AGENT_TOKEN_ID, 5000, "Max slash");
      // Further slash should fail
      await expect(staking.connect(guardian).slash(AGENT_TOKEN_ID, 1, "Double slash"))
        .to.be.revertedWithCustomError(staking, "AgentStaking__AlreadySlashed");
    });

    it("should revert on slash too high (>50%)", async function () {
      await expect(staking.connect(guardian).slash(AGENT_TOKEN_ID, 5001, "Too high"))
        .to.be.revertedWithCustomError(staking, "AgentStaking__SlashTooHigh");
    });

    it("should revert on unauthorized caller", async function () {
      await expect(staking.connect(user2).slash(AGENT_TOKEN_ID, 1000, "Bad actor"))
        .to.be.revertedWithCustomError(staking, "AgentStaking__NotAuthorized");
    });
  });

  // ── Admin ───────────────────────────────────────────────────

  describe("Admin functions", function () {
    it("should set guardian by owner", async function () {
      await staking.setGuardian(user1.address);
      expect(await staking.guardian()).to.equal(user1.address);
    });

    it("should set SharpeTracker by owner", async function () {
      const newTracker = await (await ethers.getContractFactory("SharpeTracker")).deploy(20);
      await newTracker.waitForDeployment();
      await staking.setSharpeTracker(await newTracker.getAddress());
      expect(await staking.sharpeTracker()).to.equal(await newTracker.getAddress());
    });
  });

  // ── Views ───────────────────────────────────────────────────

  describe("View functions", function () {
    it("should return correct pool data", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      const pool = await staking.getAgentPool(AGENT_TOKEN_ID);
      expect(pool.totalStaked).to.equal(STAKE_AMOUNT);
      expect(pool.stakerCount).to.equal(1);
      expect(pool.isSlashed).to.be.false;
    });

    it("should return empty data for non-staked agent", async function () {
      const pool = await staking.getAgentPool(99);
      expect(pool.totalStaked).to.equal(0);
      expect(pool.stakerCount).to.equal(0);
    });

    it("should return staked agents for user", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      const agents = await staking.getStakedAgents(user1.address);
      expect(agents.length).to.equal(1);
      expect(agents[0]).to.equal(AGENT_TOKEN_ID);
    });
  });

  // ── No SharpeTracker ────────────────────────────────────────

  describe("Without SharpeTracker", function () {
    it("should deploy without SharpeTracker (address(0))", async function () {
      const AgentStaking = await ethers.getContractFactory("AgentStaking");
      const stakingNoSharpe = await AgentStaking.deploy(
        await usdt.getAddress(),
        await agentNFA.getAddress(),
        ethers.ZeroAddress,
        guardian.address
      );
      await stakingNoSharpe.waitForDeployment();

      await usdt.connect(user1).approve(await stakingNoSharpe.getAddress(), ethers.MaxUint256);
      await stakingNoSharpe.fundRewardPool(REWARD_FUND);

      await stakingNoSharpe.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      await time.increase(ONE_YEAR);

      const pending = await stakingNoSharpe.getRewardsPending(user1.address, AGENT_TOKEN_ID);
      // 1x multiplier → 5% APY → 1000 * 0.05 = 50 USDT
      expect(pending).to.be.gte(45);
      expect(pending).to.be.lte(55);
    });
  });

  // ── Fund Reward Pool ────────────────────────────────────────

  describe("fundRewardPool()", function () {
    it("should accept reward funding", async function () {
      const before = await staking.rewardsAvailable();
      const fundAmount = ethers.parseUnits("50000", 6);
      await usdt.mint(owner.address, fundAmount);
      await staking.fundRewardPool(fundAmount);
      const after = await staking.rewardsAvailable();
      expect(after - before).to.equal(fundAmount);
    });

    it("should revert on zero funding", async function () {
      await expect(staking.fundRewardPool(0))
        .to.be.revertedWithCustomError(staking, "AgentStaking__ZeroAmount");
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────

  describe("Edge cases", function () {
    it("should handle multiple agents per user", async function () {
      // Mint second agent
      await agentNFA.mint(owner.address, operator.address, owner.address);

      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      await staking.connect(user1).stake(1, STAKE_AMOUNT);

      const agents = await staking.getStakedAgents(user1.address);
      expect(agents.length).to.equal(2);
    });

    it("should cap rewards to available pool", async function () {
      // Stake a large amount
      const largeStake = ethers.parseUnits("100000", 6);
      await usdt.mint(user1.address, largeStake);
      await staking.connect(user1).stake(AGENT_TOKEN_ID, largeStake);

      // Wait a very long time (100 years)
      await time.increase(100 * ONE_YEAR);

      // Unstake should succeed but rewards capped to pool
      const before = await usdt.balanceOf(user1.address);
      await staking.connect(user1).unstake(AGENT_TOKEN_ID, largeStake);
      const after = await usdt.balanceOf(user1.address);

      // Should not revert (capped)
      expect(after).to.be.gt(before);
    });
  });
});

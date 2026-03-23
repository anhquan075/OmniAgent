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

    for (const user of [user1, user2, owner]) {
      await usdt.mint(user.address, ethers.parseUnits("1000000", 6));
      await usdt.connect(user).approve(await staking.getAddress(), ethers.MaxUint256);
    }

    await usdt.mint(owner.address, REWARD_FUND);
    await staking.fundRewardPool(REWARD_FUND);
  }

  beforeEach(async function () {
    await deployFixture();
  });

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
      const info = await staking.getStakeInfo(user1.address, AGENT_TOKEN_ID);
      expect(info.stakedAmount).to.equal(STAKE_AMOUNT * 2n);
    });
  });

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

  describe("Rewards", function () {
    it("should accrue time-based rewards", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      await time.increase(ONE_YEAR);

      const info = await staking.getStakeInfo(user1.address, AGENT_TOKEN_ID);
      expect(info.pendingRewards).to.be.gt(0);
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

      const info = await staking.getStakeInfo(user1.address, AGENT_TOKEN_ID);
      expect(info.pendingRewards).to.equal(0);
    });

    it("should apply Sharpe performance multiplier", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      await time.increase(ONE_YEAR);

      const info = await staking.getStakeInfo(user1.address, AGENT_TOKEN_ID);
      // SharpeTracker count=0 → (0,0,0) → multiplier 8000 bps (0.8x)
      // Base APY 5% * 0.8 = 4% → 1000 USDT * 0.04 = 40 USDT
      expect(info.pendingRewards).to.be.gte(ethers.parseUnits("35", 6));
      expect(info.pendingRewards).to.be.lte(ethers.parseUnits("45", 6));
    });
  });

  describe("slash()", function () {
    beforeEach(async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
    });

    it("should slash by guardian", async function () {
      await expect(staking.connect(guardian).slash(AGENT_TOKEN_ID, 1000, "Low Sharpe"))
        .to.emit(staking, "Slashed")
        .withArgs(AGENT_TOKEN_ID, 1000, "Low Sharpe", guardian.address);
    });

    it("should slash by owner", async function () {
      await expect(staking.connect(owner).slash(AGENT_TOKEN_ID, 1000, "Owner slash"))
        .to.emit(staking, "Slashed");
    });

    it("should slash by operator (agent owner)", async function () {
      await expect(staking.connect(operator).slash(AGENT_TOKEN_ID, 1000, "Operator slash"))
        .to.emit(staking, "Slashed");
    });

    it("should mark pool as slashed with penalty", async function () {
      await staking.connect(guardian).slash(AGENT_TOKEN_ID, 1000, "Test slash");
      const pool = await staking.getAgentPool(AGENT_TOKEN_ID);
      expect(pool.isSlashed).to.be.true;
      expect(pool.slashPercentage).to.equal(1000);
    });

    it("should apply slash penalty on unstake", async function () {
      await staking.connect(guardian).slash(AGENT_TOKEN_ID, 1000, "Test slash");
      const before = await usdt.balanceOf(user1.address);
      await staking.connect(user1).unstake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      const after = await usdt.balanceOf(user1.address);
      // 10% slash → receive 90% principal (+ possible rounding from rewards)
      expect(after - before).to.be.gte(STAKE_AMOUNT * 90n / 100n);
    });

    it("should revert on max slash exceeded (50%)", async function () {
      await staking.connect(guardian).slash(AGENT_TOKEN_ID, 5000, "Max slash");
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

  describe("Admin functions", function () {
    it("should set guardian by guardian", async function () {
      await staking.connect(guardian).setGuardian(user1.address);
      expect(await staking.guardian()).to.equal(user1.address);
    });

    it("should set SharpeTracker by guardian", async function () {
      const newTracker = await (await ethers.getContractFactory("SharpeTracker")).deploy(20);
      await newTracker.waitForDeployment();
      await staking.connect(guardian).setSharpeTracker(await newTracker.getAddress());
      expect(await staking.sharpeTracker()).to.equal(await newTracker.getAddress());
    });

    it("should revert setGuardian from non-guardian", async function () {
      await expect(staking.connect(owner).setGuardian(user1.address))
        .to.be.revertedWithCustomError(staking, "AgentStaking__NotAuthorized");
    });
  });

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

    it("should return all staked agents", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      const agents = await staking.getStakedAgents();
      expect(agents.length).to.equal(1);
      expect(agents[0]).to.equal(AGENT_TOKEN_ID);
    });
  });

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
      await usdt.mint(owner.address, REWARD_FUND);
      await usdt.connect(owner).approve(await stakingNoSharpe.getAddress(), ethers.MaxUint256);
      await stakingNoSharpe.fundRewardPool(REWARD_FUND);

      await stakingNoSharpe.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      await time.increase(ONE_YEAR);

      const info = await stakingNoSharpe.getStakeInfo(user1.address, AGENT_TOKEN_ID);
      // 1x multiplier → 5% APY → 1000 USDT * 0.05 = 50 USDT
      expect(info.pendingRewards).to.be.gte(ethers.parseUnits("45", 6));
      expect(info.pendingRewards).to.be.lte(ethers.parseUnits("55", 6));
    });
  });

  describe("fundRewardPool()", function () {
    it("should accept reward funding", async function () {
      const before = await staking.rewardPool();
      const fundAmount = ethers.parseUnits("50000", 6);
      await usdt.mint(owner.address, fundAmount);
      await staking.fundRewardPool(fundAmount);
      const after = await staking.rewardPool();
      expect(after - before).to.equal(fundAmount);
    });

    it("should revert on zero funding", async function () {
      await expect(staking.fundRewardPool(0))
        .to.be.revertedWithCustomError(staking, "AgentStaking__ZeroAmount");
    });
  });

  describe("Edge cases", function () {
    it("should handle multiple agents per user", async function () {
      await agentNFA.mint(owner.address, operator.address, owner.address);

      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      await staking.connect(user1).stake(1, STAKE_AMOUNT);

      const agents = await staking.getStakedAgents();
      expect(agents.length).to.equal(2);
    });

    it("should cap rewards to available pool", async function () {
      const largeStake = ethers.parseUnits("100000", 6);
      await usdt.mint(user1.address, largeStake);
      await staking.connect(user1).stake(AGENT_TOKEN_ID, largeStake);

      await time.increase(100 * ONE_YEAR);

      const before = await usdt.balanceOf(user1.address);
      await staking.connect(user1).unstake(AGENT_TOKEN_ID, largeStake);
      const after = await usdt.balanceOf(user1.address);

      expect(after).to.be.gt(before);
    });
  });
});

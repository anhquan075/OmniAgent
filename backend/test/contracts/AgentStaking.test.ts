import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("AgentStaking", function () {
  let staking: any;
  let usdt: any;
  let agentNFA: any;
  let sharpeTracker: any;
  let owner: HardhatEthersSigner;
  let guardian: HardhatEthersSigner;
  let operator: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;

  const AGENT_TOKEN_ID = 0;
  const STAKE_AMOUNT = ethers.parseUnits("1000", 6); // 1000 USDT
  const REWARD_FUND = ethers.parseUnits("100000", 6); // 100k USDT
  const ONE_YEAR = 365 * 24 * 60 * 60;

  async function deployFixture() {
    [owner, guardian, operator, user1, user2] = await ethers.getSigners();

    // Deploy MockERC20 as USDT (6 decimals)
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdt = await (await MockERC20.deploy("Tether USD", "USDT")).waitForDeployment();
    await (await usdt.setDecimals(6)).wait();

    // Deploy AgentNFA
    const AgentNFA = await ethers.getContractFactory("AgentNFA");
    agentNFA = await (await AgentNFA.deploy()).waitForDeployment();

    // Mint agent #0 with operator (policyGuard must be non-zero)
    await (await agentNFA.mint(owner.address, operator.address, owner.address)).wait();

    // Deploy SharpeTracker
    const SharpeTracker = await ethers.getContractFactory("SharpeTracker");
    sharpeTracker = await (await SharpeTracker.deploy(20)).waitForDeployment();

    // Deploy AgentStaking
    const AgentStaking = await ethers.getContractFactory("AgentStaking");
    staking = await (
      await AgentStaking.deploy(
        await usdt.getAddress(),
        await agentNFA.getAddress(),
        await sharpeTracker.getAddress(),
        guardian.address
      )
    ).waitForDeployment();

    // Mint USDT to users and approve
    for (const user of [user1, user2, owner]) {
      await (await usdt.mint(user.address, ethers.parseUnits("1000000", 6))).wait();
      await (await usdt.connect(user).approve(await staking.getAddress(), ethers.MaxUint256)).wait();
    }

    // Fund reward pool
    await (await usdt.mint(owner.address, REWARD_FUND)).wait();
    await (await staking.fundRewardPool(REWARD_FUND)).wait();
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
      await staking.connect(user2).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);

      const pool = await staking.getAgentPool(AGENT_TOKEN_ID);
      expect(pool.totalStaked).to.equal(STAKE_AMOUNT * 2n);
      expect(pool.stakerCount).to.equal(2);
    });

    it("should allow stacking multiple stakes", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);

      const info = await staking.getStakeInfo(user1.address, AGENT_TOKEN_ID);
      expect(info.stakedAmount).to.equal(STAKE_AMOUNT * 2n);

      // stakerCount should still be 1
      const pool = await staking.getAgentPool(AGENT_TOKEN_ID);
      expect(pool.stakerCount).to.equal(1);
    });

    it("should track staked agent IDs", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      const agents = await staking.getStakedAgents();
      expect(agents.length).to.equal(1);
      expect(agents[0]).to.equal(AGENT_TOKEN_ID);
    });

    it("should transfer USDT from user to contract", async function () {
      const balBefore = await usdt.balanceOf(user1.address);
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      const balAfter = await usdt.balanceOf(user1.address);
      expect(balBefore - balAfter).to.equal(STAKE_AMOUNT);
    });

    it("should revert on zero amount", async function () {
      await expect(staking.connect(user1).stake(AGENT_TOKEN_ID, 0))
        .to.be.revertedWithCustomError(staking, "AgentStaking__ZeroAmount");
    });

    it("should revert on non-existent agent", async function () {
      await expect(staking.connect(user1).stake(999, STAKE_AMOUNT))
        .to.be.revertedWithCustomError(staking, "AgentStaking__AgentNotFound");
    });
  });

  // ── Unstaking ───────────────────────────────────────────────

  describe("unstake()", function () {
    beforeEach(async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
    });

    it("should unstake and return principal", async function () {
      const balBefore = await usdt.balanceOf(user1.address);
      await staking.connect(user1).unstake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      const balAfter = await usdt.balanceOf(user1.address);

      // Should get back at least principal (plus any tiny reward)
      expect(balAfter - balBefore).to.be.gte(STAKE_AMOUNT);
    });

    it("should emit Unstaked event", async function () {
      await expect(staking.connect(user1).unstake(AGENT_TOKEN_ID, STAKE_AMOUNT))
        .to.emit(staking, "Unstaked");
    });

    it("should allow partial unstake", async function () {
      const half = STAKE_AMOUNT / 2n;
      await staking.connect(user1).unstake(AGENT_TOKEN_ID, half);

      const info = await staking.getStakeInfo(user1.address, AGENT_TOKEN_ID);
      expect(info.stakedAmount).to.equal(half);

      // stakerCount should still be 1
      const pool = await staking.getAgentPool(AGENT_TOKEN_ID);
      expect(pool.stakerCount).to.equal(1);
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
      await expect(staking.connect(user1).unstake(AGENT_TOKEN_ID, STAKE_AMOUNT + 1n))
        .to.be.revertedWithCustomError(staking, "AgentStaking__InsufficientStake");
    });
  });

  // ── Rewards ─────────────────────────────────────────────────

  describe("Rewards", function () {
    it("should accrue rewards over time", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);

      // Advance 1 year
      await time.increase(ONE_YEAR);

      const info = await staking.getStakeInfo(user1.address, AGENT_TOKEN_ID);
      // With no SharpeTracker data (returns 0,0,0 → multiplier = 8000 bps = 0.8x)
      // Expected: 1000 * 5% * 0.8 = 40 USDT
      // Allow some tolerance for block timing
      const expectedMin = ethers.parseUnits("39", 6);
      const expectedMax = ethers.parseUnits("41", 6);
      expect(info.pendingRewards).to.be.gte(expectedMin);
      expect(info.pendingRewards).to.be.lte(expectedMax);
    });

    it("should pay rewards on unstake", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      await time.increase(ONE_YEAR);

      const balBefore = await usdt.balanceOf(user1.address);
      await staking.connect(user1).unstake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      const balAfter = await usdt.balanceOf(user1.address);

      const received = balAfter - balBefore;
      // Should get principal + ~40 USDT rewards
      expect(received).to.be.gt(STAKE_AMOUNT);
    });

    it("should claim rewards on additional stake", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      await time.increase(ONE_YEAR);

      const balBefore = await usdt.balanceOf(user1.address);
      // Stake more — should auto-claim pending rewards
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      const balAfter = await usdt.balanceOf(user1.address);

      // Net cost should be less than STAKE_AMOUNT because rewards were claimed
      const netCost = balBefore - balAfter;
      expect(netCost).to.be.lt(STAKE_AMOUNT);
    });

    it("should return zero rewards for zero time elapsed", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      const info = await staking.getStakeInfo(user1.address, AGENT_TOKEN_ID);
      // Pending rewards should be ~0 (maybe 1 block)
      expect(info.pendingRewards).to.be.lte(ethers.parseUnits("1", 6));
    });
  });

  // ── Slashing ────────────────────────────────────────────────

  describe("slash()", function () {
    beforeEach(async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
    });

    it("should allow guardian to slash", async function () {
      await expect(staking.connect(guardian).slash(AGENT_TOKEN_ID, 2000, "Misbehavior"))
        .to.emit(staking, "Slashed")
        .withArgs(AGENT_TOKEN_ID, 2000, "Misbehavior", guardian.address);

      const pool = await staking.getAgentPool(AGENT_TOKEN_ID);
      expect(pool.isSlashed).to.be.true;
      expect(pool.slashPercentage).to.equal(2000);
    });

    it("should allow agent owner to slash", async function () {
      await expect(staking.connect(owner).slash(AGENT_TOKEN_ID, 1000, "Owner slash"))
        .to.emit(staking, "Slashed");
    });

    it("should allow agent operator to slash", async function () {
      await expect(staking.connect(operator).slash(AGENT_TOKEN_ID, 1000, "Operator slash"))
        .to.emit(staking, "Slashed");
    });

    it("should apply slash penalty on unstake", async function () {
      await staking.connect(guardian).slash(AGENT_TOKEN_ID, 2000, "Bad agent"); // 20%

      const balBefore = await usdt.balanceOf(user1.address);
      await staking.connect(user1).unstake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      const balAfter = await usdt.balanceOf(user1.address);

      const received = balAfter - balBefore;
      // Should receive 800 USDT + rewards (20% slashed from 1000)
      const expectedPrincipal = (STAKE_AMOUNT * 8000n) / 10000n; // 800 USDT
      expect(received).to.be.gte(expectedPrincipal);
      expect(received).to.be.lt(STAKE_AMOUNT); // less than full principal
    });

    it("should show slash penalty in getStakeInfo", async function () {
      await staking.connect(guardian).slash(AGENT_TOKEN_ID, 2000, "Bad");

      const info = await staking.getStakeInfo(user1.address, AGENT_TOKEN_ID);
      const expectedPenalty = (STAKE_AMOUNT * 2000n) / 10000n; // 200 USDT
      expect(info.slashPenalty).to.equal(expectedPenalty);
    });

    it("should revert on zero slash percentage", async function () {
      await expect(staking.connect(guardian).slash(AGENT_TOKEN_ID, 0, "reason"))
        .to.be.revertedWithCustomError(staking, "AgentStaking__SlashTooHigh");
    });

    it("should revert on slash > MAX_SLASH (50%)", async function () {
      await expect(staking.connect(guardian).slash(AGENT_TOKEN_ID, 5001, "reason"))
        .to.be.revertedWithCustomError(staking, "AgentStaking__SlashTooHigh");
    });

    it("should revert on double slash", async function () {
      await staking.connect(guardian).slash(AGENT_TOKEN_ID, 1000, "first");
      await expect(staking.connect(guardian).slash(AGENT_TOKEN_ID, 1000, "second"))
        .to.be.revertedWithCustomError(staking, "AgentStaking__AlreadySlashed");
    });

    it("should revert when unauthorized user tries to slash", async function () {
      await expect(staking.connect(user2).slash(AGENT_TOKEN_ID, 1000, "reason"))
        .to.be.revertedWithCustomError(staking, "AgentStaking__NotAuthorized");
    });

    it("should revert on non-existent agent", async function () {
      await expect(staking.connect(guardian).slash(999, 1000, "reason"))
        .to.be.revertedWithCustomError(staking, "AgentStaking__AgentNotFound");
    });
  });

  // ── Reward Pool Funding ─────────────────────────────────────

  describe("fundRewardPool()", function () {
    it("should accept funding", async function () {
      const amount = ethers.parseUnits("5000", 6);
      const poolBefore = await staking.rewardPool();
      await expect(staking.connect(user1).fundRewardPool(amount))
        .to.emit(staking, "RewardPoolFunded")
        .withArgs(user1.address, amount);
      const poolAfter = await staking.rewardPool();
      expect(poolAfter - poolBefore).to.equal(amount);
    });

    it("should revert on zero funding", async function () {
      await expect(staking.fundRewardPool(0))
        .to.be.revertedWithCustomError(staking, "AgentStaking__ZeroAmount");
    });
  });

  // ── Guardian Admin ──────────────────────────────────────────

  describe("setGuardian()", function () {
    it("should allow guardian to transfer role", async function () {
      await expect(staking.connect(guardian).setGuardian(user1.address))
        .to.emit(staking, "GuardianUpdated")
        .withArgs(guardian.address, user1.address);

      expect(await staking.guardian()).to.equal(user1.address);
    });

    it("should revert when non-guardian calls", async function () {
      await expect(staking.connect(user1).setGuardian(user2.address))
        .to.be.revertedWithCustomError(staking, "AgentStaking__NotAuthorized");
    });
  });

  describe("setSharpeTracker()", function () {
    it("should allow guardian to update tracker", async function () {
      await staking.connect(guardian).setSharpeTracker(ethers.ZeroAddress);
      // No explicit getter for sharpeTracker address, but disabling it
      // changes reward multiplier to 1x (BPS)
    });

    it("should revert when non-guardian calls", async function () {
      await expect(staking.connect(user1).setSharpeTracker(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(staking, "AgentStaking__NotAuthorized");
    });
  });

  // ── View Functions ──────────────────────────────────────────

  describe("Views", function () {
    it("should return correct pool data", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      const pool = await staking.getAgentPool(AGENT_TOKEN_ID);
      expect(pool.totalStaked).to.equal(STAKE_AMOUNT);
      expect(pool.stakerCount).to.equal(1);
      expect(pool.isSlashed).to.be.false;
      expect(pool.slashPercentage).to.equal(0);
    });

    it("should return empty data for unstaked agents", async function () {
      const info = await staking.getStakeInfo(user1.address, AGENT_TOKEN_ID);
      expect(info.stakedAmount).to.equal(0);
      expect(info.pendingRewards).to.equal(0);
      expect(info.slashPenalty).to.equal(0);
    });
  });

  // ── Deployment without SharpeTracker ────────────────────────

  describe("No SharpeTracker", function () {
    it("should deploy with address(0) SharpeTracker and use 1x multiplier", async function () {
      const AgentStaking = await ethers.getContractFactory("AgentStaking");
      const noTracker = await (
        await AgentStaking.deploy(
          await usdt.getAddress(),
          await agentNFA.getAddress(),
          ethers.ZeroAddress,
          guardian.address
        )
      ).waitForDeployment();

      await (await usdt.connect(user1).approve(await noTracker.getAddress(), ethers.MaxUint256)).wait();
      await (await usdt.mint(owner.address, REWARD_FUND)).wait();
      await (await usdt.approve(await noTracker.getAddress(), REWARD_FUND)).wait();
      await noTracker.fundRewardPool(REWARD_FUND);

      await noTracker.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      await time.increase(ONE_YEAR);

      const info = await noTracker.getStakeInfo(user1.address, AGENT_TOKEN_ID);
      // 1x multiplier → 1000 * 5% * 1.0 = 50 USDT
      const expectedMin = ethers.parseUnits("49", 6);
      const expectedMax = ethers.parseUnits("51", 6);
      expect(info.pendingRewards).to.be.gte(expectedMin);
      expect(info.pendingRewards).to.be.lte(expectedMax);
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────

  describe("Edge Cases", function () {
    it("should handle max slash (50%) correctly", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      await staking.connect(guardian).slash(AGENT_TOKEN_ID, 5000, "Max slash");

      const info = await staking.getStakeInfo(user1.address, AGENT_TOKEN_ID);
      expect(info.slashPenalty).to.equal(STAKE_AMOUNT / 2n);
    });

    it("should handle multiple users staking on same agent", async function () {
      await staking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      await staking.connect(user2).stake(AGENT_TOKEN_ID, STAKE_AMOUNT * 2n);

      const pool = await staking.getAgentPool(AGENT_TOKEN_ID);
      expect(pool.totalStaked).to.equal(STAKE_AMOUNT * 3n);
      expect(pool.stakerCount).to.equal(2);

      // Each user's stake is independent
      const info1 = await staking.getStakeInfo(user1.address, AGENT_TOKEN_ID);
      const info2 = await staking.getStakeInfo(user2.address, AGENT_TOKEN_ID);
      expect(info1.stakedAmount).to.equal(STAKE_AMOUNT);
      expect(info2.stakedAmount).to.equal(STAKE_AMOUNT * 2n);
    });

    it("should cap rewards to available reward pool", async function () {
      // Deploy a fresh staking with tiny reward pool
      const AgentStaking = await ethers.getContractFactory("AgentStaking");
      const tinyStaking = await (
        await AgentStaking.deploy(
          await usdt.getAddress(),
          await agentNFA.getAddress(),
          ethers.ZeroAddress,
          guardian.address
        )
      ).waitForDeployment();

      const tinyReward = ethers.parseUnits("1", 6); // Only 1 USDT in reward pool
      await (await usdt.approve(await tinyStaking.getAddress(), ethers.MaxUint256)).wait();
      await tinyStaking.fundRewardPool(tinyReward);

      await (await usdt.connect(user1).approve(await tinyStaking.getAddress(), ethers.MaxUint256)).wait();
      await tinyStaking.connect(user1).stake(AGENT_TOKEN_ID, STAKE_AMOUNT);

      // Advance a long time to accrue more rewards than pool has
      await time.increase(ONE_YEAR * 10);

      // Unstake — should not revert, rewards capped
      const balBefore = await usdt.balanceOf(user1.address);
      await tinyStaking.connect(user1).unstake(AGENT_TOKEN_ID, STAKE_AMOUNT);
      const balAfter = await usdt.balanceOf(user1.address);

      const received = balAfter - balBefore;
      // Should get principal + at most tinyReward
      expect(received).to.be.lte(STAKE_AMOUNT + tinyReward);
    });
  });
});

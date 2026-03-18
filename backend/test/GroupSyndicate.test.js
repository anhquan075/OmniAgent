const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GroupSyndicate", function () {
  let GroupSyndicate, OmniAgentVault, ERC20Mock;
  let syndicate, vault, asset;
  let owner, agent, user1, user2, user3;
  
  const contributionAmount = ethers.parseUnits("100", 6);
  const roundDuration = 7 * 24 * 60 * 60; // 1 week

  beforeEach(async function () {
    [owner, agent, user1, user2, user3] = await ethers.getSigners();

    // Deploy Mock ERC20
    const ERC20 = await ethers.getContractFactory("MockUSDC");
    asset = await ERC20.deploy();

    // Deploy Mock Vault (ERC4626)
    const Vault = await ethers.getContractFactory("MockERC4626Vault");
    vault = await Vault.deploy(asset.target, "Mock Vault", "MVLT", 6);

    // Deploy Syndicate
    const Syndicate = await ethers.getContractFactory("GroupSyndicate");
    syndicate = await Syndicate.deploy(
      vault.target,
      contributionAmount,
      roundDuration,
      [user1.address, user2.address, user3.address],
      agent.address
    );

    // Fund users
    await asset.mint(user1.address, ethers.parseUnits("1000", 6));
    await asset.mint(user2.address, ethers.parseUnits("1000", 6));
    await asset.mint(user3.address, ethers.parseUnits("1000", 6));

    // Approve syndicate
    await asset.connect(user1).approve(syndicate.target, ethers.MaxUint256);
    await asset.connect(user2).approve(syndicate.target, ethers.MaxUint256);
    await asset.connect(user3).approve(syndicate.target, ethers.MaxUint256);
  });

  it("should allow members to contribute", async function () {
    await expect(syndicate.connect(user1).contribute())
      .to.emit(syndicate, "Contributed")
      .withArgs(user1.address, 1, contributionAmount);

    expect(await asset.balanceOf(vault.target)).to.equal(contributionAmount);
  });

  it("should block non-members from contributing", async function () {
    await expect(syndicate.connect(owner).contribute())
      .to.be.revertedWithCustomError(syndicate, "Syndicate__NotMember");
  });

  it("should prevent double contribution in same round", async function () {
    await syndicate.connect(user1).contribute();
    await expect(syndicate.connect(user1).contribute())
      .to.be.revertedWithCustomError(syndicate, "Syndicate__AlreadyContributed");
  });

  it("should allow agent to execute payout to rotating beneficiary", async function () {
    // Round 1 contributions
    await syndicate.connect(user1).contribute();
    await syndicate.connect(user2).contribute();
    await syndicate.connect(user3).contribute();

    // Fast forward time
    await ethers.provider.send("evm_increaseTime", [roundDuration + 1]);
    await ethers.provider.send("evm_mine", []);

    // Agent executes payout
    // user1 should be the beneficiary (index 0)
    await expect(syndicate.connect(agent).executePayout())
      .to.emit(syndicate, "PayoutExecuted")
      .withArgs(user1.address, 1, contributionAmount * 3n);

    expect(await asset.balanceOf(user1.address)).to.equal(
      ethers.parseUnits("1000", 6) - contributionAmount + (contributionAmount * 3n)
    );
  });
});

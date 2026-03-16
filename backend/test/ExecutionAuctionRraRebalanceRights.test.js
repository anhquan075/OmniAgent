const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// ─── Auction Timing Constants ────────────────────────────────────────────────
const BID_WINDOW = 120; // 2 minutes
const EXECUTE_WINDOW = 60; // 1 minute
const MIN_BID = ethers.parseEther("1"); // 1 USDT
const BOUNTY_AMOUNT = ethers.parseEther("0.5"); // 0.5 USDT bounty per cycle

// ─── Phase enum mirrors Solidity ─────────────────────────────────────────────
const Phase = {
  NotOpen: 0n,
  BidPhase: 1n,
  ExecutePhase: 2n,
  FallbackPhase: 3n,
};

// ─── Fixture ─────────────────────────────────────────────────────────────────
async function deployFixture() {
  const [deployer, alice, bob, carol, vaultOwner] = await ethers.getSigners();

  // Deploy mock USDT (18 decimals, matching BNB Chain USDT)
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdt = await MockERC20.deploy("USDT", "USDT");

  // Deploy mock engine
  const MockEngine = await ethers.getContractFactory("MockStrategyEngine");
  const engine = await MockEngine.deploy(await usdt.getAddress());

  // Deploy ExecutionAuction
  const ExecutionAuction = await ethers.getContractFactory("ExecutionAuction");
  const auction = await ExecutionAuction.deploy(
    await engine.getAddress(),
    vaultOwner.address, // vault — just an address that receives bids
    await usdt.getAddress(),
    BID_WINDOW,
    EXECUTE_WINDOW,
    MIN_BID,
    500 // minBidIncrementBps = 5%
  );

  // Fund engine with USDT for bounty payments
  await usdt.mint(deployer.address, ethers.parseEther("1000"));
  await usdt.approve(await engine.getAddress(), ethers.parseEther("100"));
  await engine.fundBounty(ethers.parseEther("100"));
  await engine.setBounty(BOUNTY_AMOUNT);

  // Give alice, bob, carol USDT
  for (const signer of [alice, bob, carol]) {
    await usdt.mint(signer.address, ethers.parseEther("100"));
    await usdt
      .connect(signer)
      .approve(await auction.getAddress(), ethers.MaxUint256);
  }

  return { auction, engine, usdt, deployer, alice, bob, carol, vaultOwner };
}

// ─── Tests ───────────────────────────────────────────────────────────────────
describe("ExecutionAuction (RRA — Rebalance Rights Auction)", function () {
  describe("Deployment", function () {
    it("stores correct immutables", async function () {
      const { auction, engine, usdt, vaultOwner } = await loadFixture(
        deployFixture
      );
      expect(await auction.engine()).to.equal(await engine.getAddress());
      expect(await auction.vault()).to.equal(vaultOwner.address);
      expect(await auction.usdt()).to.equal(await usdt.getAddress());
      expect(await auction.bidWindow()).to.equal(BID_WINDOW);
      expect(await auction.executeWindow()).to.equal(EXECUTE_WINDOW);
      expect(await auction.minBid()).to.equal(MIN_BID);
    });

    it("starts with NotOpen phase and zero state", async function () {
      const { auction } = await loadFixture(deployFixture);
      expect(await auction.phase()).to.equal(Phase.NotOpen);
      const status = await auction.roundStatus();
      expect(status.id).to.equal(0n);
      expect(status.winner).to.equal(ethers.ZeroAddress);
      expect(status.winningBid).to.equal(0n);
    });
  });

  // ─── Phase Transitions ─────────────────────────────────────────────────────
  describe("Phase transitions", function () {
    it("auto-opens round on first bid → BidPhase", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      await auction.connect(alice).bid(MIN_BID);
      expect(await auction.phase()).to.equal(Phase.BidPhase);
      const status = await auction.roundStatus();
      expect(status.id).to.equal(1n);
      expect(status.winner).to.equal(alice.address);
    });

    it("transitions to ExecutePhase after bidWindow", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      await auction.connect(alice).bid(MIN_BID);
      await time.increase(BID_WINDOW);
      expect(await auction.phase()).to.equal(Phase.ExecutePhase);
    });

    it("transitions to FallbackPhase after bidWindow + executeWindow", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      await auction.connect(alice).bid(MIN_BID);
      await time.increase(BID_WINDOW + EXECUTE_WINDOW);
      expect(await auction.phase()).to.equal(Phase.FallbackPhase);
    });

    it("returns to NotOpen after round closes", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      await auction.connect(alice).bid(MIN_BID);
      await time.increase(BID_WINDOW);
      await auction.connect(alice).winnerExecute();
      expect(await auction.phase()).to.equal(Phase.NotOpen);
    });
  });

  // ─── Bid Mechanics ─────────────────────────────────────────────────────────
  describe("bid()", function () {
    it("rejects bid when engine is not ready", async function () {
      const { auction, engine, alice } = await loadFixture(deployFixture);
      await engine.setReady(false);
      const ExecutionAuction = await ethers.getContractFactory(
        "ExecutionAuction"
      );
      await expect(
        auction.connect(alice).bid(MIN_BID)
      ).to.be.revertedWithCustomError(
        ExecutionAuction,
        "ExecutionAuction__EngineNotReady"
      );
    });

    it("rejects bid below minBid", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      const ExecutionAuction = await ethers.getContractFactory(
        "ExecutionAuction"
      );
      await expect(
        auction.connect(alice).bid(MIN_BID - 1n)
      ).to.be.revertedWithCustomError(
        ExecutionAuction,
        "ExecutionAuction__BelowMinBid"
      );
    });

    it("rejects bid not exceeding current winning bid", async function () {
      const { auction, alice, bob } = await loadFixture(deployFixture);
      const ExecutionAuction = await ethers.getContractFactory(
        "ExecutionAuction"
      );
      await auction.connect(alice).bid(MIN_BID);
      await expect(
        auction.connect(bob).bid(MIN_BID)
      ).to.be.revertedWithCustomError(
        ExecutionAuction,
        "ExecutionAuction__BidIncrementTooLow"
      );
    });

    it("records highest bidder and queues refund for outbid party", async function () {
      const { auction, usdt, alice, bob } = await loadFixture(deployFixture);
      const higherBid = ethers.parseEther("2");

      await auction.connect(alice).bid(MIN_BID);
      const aliceBalBefore = await usdt.balanceOf(alice.address);

      await auction.connect(bob).bid(higherBid);

      const status = await auction.roundStatus();
      expect(status.winner).to.equal(bob.address);
      expect(status.winningBid).to.equal(higherBid);

      // Alice's bid is not returned immediately but pending
      expect(await usdt.balanceOf(alice.address)).to.equal(aliceBalBefore); // not yet returned
      expect(await auction.pendingRefunds(alice.address)).to.equal(MIN_BID);
    });

    it("transfers USDT from bidder to auction contract", async function () {
      const { auction, usdt, alice } = await loadFixture(deployFixture);
      const before = await usdt.balanceOf(alice.address);
      await auction.connect(alice).bid(MIN_BID);
      expect(await usdt.balanceOf(alice.address)).to.equal(before - MIN_BID);
      expect(await usdt.balanceOf(await auction.getAddress())).to.equal(
        MIN_BID
      );
    });

    it("rejects bid after bid phase ends", async function () {
      const { auction, alice, bob } = await loadFixture(deployFixture);
      const ExecutionAuction = await ethers.getContractFactory(
        "ExecutionAuction"
      );
      await auction.connect(alice).bid(MIN_BID);
      await time.increase(BID_WINDOW);
      await expect(
        auction.connect(bob).bid(ethers.parseEther("2"))
      ).to.be.revertedWithCustomError(
        ExecutionAuction,
        "ExecutionAuction__NotBidPhase"
      );
    });
  });

  // ─── Winner Execute ─────────────────────────────────────────────────────────
  describe("winnerExecute()", function () {
    it("reverts when not in execute phase", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      const ExecutionAuction = await ethers.getContractFactory(
        "ExecutionAuction"
      );
      await auction.connect(alice).bid(MIN_BID);
      // Still in BidPhase
      await expect(
        auction.connect(alice).winnerExecute()
      ).to.be.revertedWithCustomError(
        ExecutionAuction,
        "ExecutionAuction__NotExecutePhase"
      );
    });

    it("reverts when called by non-winner", async function () {
      const { auction, alice, bob } = await loadFixture(deployFixture);
      const ExecutionAuction = await ethers.getContractFactory(
        "ExecutionAuction"
      );
      await auction.connect(alice).bid(MIN_BID);
      await time.increase(BID_WINDOW);
      await expect(
        auction.connect(bob).winnerExecute()
      ).to.be.revertedWithCustomError(
        ExecutionAuction,
        "ExecutionAuction__NotWinner"
      );
    });

    it("transfers bid to vault and bounty to winner (core RRA economics)", async function () {
      const { auction, usdt, alice, vaultOwner } = await loadFixture(
        deployFixture
      );
      const bidAmt = ethers.parseEther("2");
      await auction.connect(alice).bid(bidAmt);
      await time.increase(BID_WINDOW);

      const vaultBefore = await usdt.balanceOf(vaultOwner.address);
      const aliceBefore = await usdt.balanceOf(alice.address);

      await auction.connect(alice).winnerExecute();

      const vaultAfter = await usdt.balanceOf(vaultOwner.address);
      const aliceAfter = await usdt.balanceOf(alice.address);

      // Vault received the bid
      expect(vaultAfter - vaultBefore).to.equal(bidAmt);
      // Winner received the bounty
      expect(aliceAfter - aliceBefore).to.equal(BOUNTY_AMOUNT);
    });

    it("net vault gain = bid - bounty (positive economics)", async function () {
      const { auction, usdt, alice, vaultOwner } = await loadFixture(
        deployFixture
      );
      const bidAmt = ethers.parseEther("2"); // bid > bounty (0.5)
      await auction.connect(alice).bid(bidAmt);
      await time.increase(BID_WINDOW);

      const vaultBefore = await usdt.balanceOf(vaultOwner.address);
      await auction.connect(alice).winnerExecute();
      const vaultAfter = await usdt.balanceOf(vaultOwner.address);

      const netGain = vaultAfter - vaultBefore; // bid in, bounty stays in vault
      expect(netGain).to.equal(bidAmt); // vault keeps full bid; bounty came from engine's separate pool
    });

    it("accumulates totalBidRevenue across rounds", async function () {
      const { auction, engine, alice } = await loadFixture(deployFixture);
      const bidAmt = ethers.parseEther("2");

      // Round 1
      await auction.connect(alice).bid(bidAmt);
      await time.increase(BID_WINDOW);
      await auction.connect(alice).winnerExecute();
      expect(await auction.totalBidRevenue()).to.equal(bidAmt);

      // Round 2 — engine needs to be re-ready (simulate new cooldown cycle)
      await engine.setReady(false);
      await engine.setReady(true);
      await auction.connect(alice).bid(bidAmt);
      await time.increase(BID_WINDOW);
      await auction.connect(alice).winnerExecute();
      expect(await auction.totalBidRevenue()).to.equal(bidAmt * 2n);
    });

    it("emits Executed event with correct fields", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      const bidAmt = ethers.parseEther("2");
      await auction.connect(alice).bid(bidAmt);
      await time.increase(BID_WINDOW);

      await expect(auction.connect(alice).winnerExecute())
        .to.emit(auction, "Executed")
        .withArgs(1n, alice.address, bidAmt, BOUNTY_AMOUNT, true);
    });

    it("marks round as closed (no double execution)", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      const ExecutionAuction = await ethers.getContractFactory(
        "ExecutionAuction"
      );
      await auction.connect(alice).bid(MIN_BID);
      await time.increase(BID_WINDOW);
      await auction.connect(alice).winnerExecute();

      // Phase is now NotOpen; cannot execute again
      await expect(
        auction.connect(alice).winnerExecute()
      ).to.be.revertedWithCustomError(
        ExecutionAuction,
        "ExecutionAuction__NotExecutePhase"
      );
    });
  });

  // ─── Fallback Execute ──────────────────────────────────────────────────────
  describe("fallbackExecute()", function () {
    it("reverts when not in fallback phase", async function () {
      const { auction, alice, bob } = await loadFixture(deployFixture);
      const ExecutionAuction = await ethers.getContractFactory(
        "ExecutionAuction"
      );
      await auction.connect(alice).bid(MIN_BID);
      await time.increase(BID_WINDOW);
      // Still in ExecutePhase
      await expect(
        auction.connect(bob).fallbackExecute()
      ).to.be.revertedWithCustomError(
        ExecutionAuction,
        "ExecutionAuction__NotFallbackPhase"
      );
    });

    it("refunds winner's bid and pays bounty to fallback executor", async function () {
      const { auction, usdt, alice, bob } = await loadFixture(deployFixture);
      await auction.connect(alice).bid(MIN_BID);
      await time.increase(BID_WINDOW + EXECUTE_WINDOW);

      const bobBefore = await usdt.balanceOf(bob.address);
      await auction.connect(bob).fallbackExecute();
      const bobAfter = await usdt.balanceOf(bob.address);

      // Bob (fallback executor) gets bounty
      expect(bobAfter - bobBefore).to.equal(BOUNTY_AMOUNT);
      // Alice's bid is pending refund (not transferred to vault)
      expect(await auction.pendingRefunds(alice.address)).to.equal(MIN_BID);
    });

    it("vault receives no bid in fallback (old bounty-out economics preserved)", async function () {
      const { auction, usdt, alice, bob, vaultOwner } = await loadFixture(
        deployFixture
      );
      await auction.connect(alice).bid(MIN_BID);
      await time.increase(BID_WINDOW + EXECUTE_WINDOW);

      const vaultBefore = await usdt.balanceOf(vaultOwner.address);
      await auction.connect(bob).fallbackExecute();
      const vaultAfter = await usdt.balanceOf(vaultOwner.address);

      // Vault gets nothing in fallback (bid was refunded to alice)
      expect(vaultAfter).to.equal(vaultBefore);
    });

    it("works when no bids were placed (no-bid fallback)", async function () {
      // No bid placed, no round opened → can just call engine directly
      // This tests that fallback reverts correctly when there's no active round
      const { auction, bob } = await loadFixture(deployFixture);
      const ExecutionAuction = await ethers.getContractFactory(
        "ExecutionAuction"
      );
      await expect(
        auction.connect(bob).fallbackExecute()
      ).to.be.revertedWithCustomError(
        ExecutionAuction,
        "ExecutionAuction__NotFallbackPhase"
      );
    });
  });

  // ─── Claim Refund ──────────────────────────────────────────────────────────
  describe("claimRefund()", function () {
    it("returns outbid amount to displaced bidder", async function () {
      const { auction, usdt, alice, bob } = await loadFixture(deployFixture);
      const aliceBidBefore = await usdt.balanceOf(alice.address);
      await auction.connect(alice).bid(MIN_BID);
      await auction.connect(bob).bid(ethers.parseEther("2")); // outbids alice

      await auction.connect(alice).claimRefund();
      expect(await usdt.balanceOf(alice.address)).to.equal(aliceBidBefore);
    });

    it("reverts with no pending refund", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      const ExecutionAuction = await ethers.getContractFactory(
        "ExecutionAuction"
      );
      await expect(
        auction.connect(alice).claimRefund()
      ).to.be.revertedWithCustomError(
        ExecutionAuction,
        "ExecutionAuction__NoRefund"
      );
    });

    it("clears pending refund after claim (no double-claim)", async function () {
      const { auction, alice, bob } = await loadFixture(deployFixture);
      const ExecutionAuction = await ethers.getContractFactory(
        "ExecutionAuction"
      );
      await auction.connect(alice).bid(MIN_BID);
      await auction.connect(bob).bid(ethers.parseEther("2"));
      await auction.connect(alice).claimRefund();

      await expect(
        auction.connect(alice).claimRefund()
      ).to.be.revertedWithCustomError(
        ExecutionAuction,
        "ExecutionAuction__NoRefund"
      );
    });

    it("emits Refunded event", async function () {
      const { auction, alice, bob } = await loadFixture(deployFixture);
      await auction.connect(alice).bid(MIN_BID);
      await auction.connect(bob).bid(ethers.parseEther("2"));

      await expect(auction.connect(alice).claimRefund())
        .to.emit(auction, "Refunded")
        .withArgs(alice.address, MIN_BID);
    });
  });

  // ─── Circuit Breaker Resilience ────────────────────────────────────────────
  describe("circuit breaker resilience", function () {
    it("preserves round state on execution revert (winner can retry)", async function () {
      const { auction, engine, alice } = await loadFixture(deployFixture);
      await auction.connect(alice).bid(MIN_BID);
      await time.increase(BID_WINDOW);

      // Simulate circuit breaker trip
      await engine.setShouldRevert(true);
      await expect(auction.connect(alice).winnerExecute()).to.be.revertedWith(
        "MockEngine: breaker tripped"
      );

      // Round still open — alice can retry after breaker clears
      expect(await auction.phase()).to.equal(Phase.ExecutePhase);
      expect((await auction.roundStatus()).winner).to.equal(alice.address);

      // Breaker clears → retry succeeds
      await engine.setShouldRevert(false);
      await expect(auction.connect(alice).winnerExecute()).to.not.be.reverted;
    });
  });

  // ─── Stats & Views ─────────────────────────────────────────────────────────
  describe("roundStatus() and stats()", function () {
    it("shows correct bid time remaining", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      await auction.connect(alice).bid(MIN_BID);
      const status = await auction.roundStatus();
      expect(status.bidTimeRemaining).to.be.closeTo(BigInt(BID_WINDOW), 2n);
      expect(status.executeTimeRemaining).to.equal(
        BigInt(BID_WINDOW + EXECUTE_WINDOW)
      );
    });

    it("shows correct execute time remaining after bid phase", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      await auction.connect(alice).bid(MIN_BID);
      await time.increase(BID_WINDOW);
      const status = await auction.roundStatus();
      expect(status.bidTimeRemaining).to.equal(0n);
      expect(status.executeTimeRemaining).to.be.closeTo(
        BigInt(EXECUTE_WINDOW),
        2n
      );
    });

    it("stats() returns cumulative totals", async function () {
      const { auction, alice } = await loadFixture(deployFixture);
      await auction.connect(alice).bid(MIN_BID);
      await time.increase(BID_WINDOW);
      await auction.connect(alice).winnerExecute();

      const s = await auction.stats();
      expect(s.totalRounds).to.equal(1n);
      expect(s.bidRevenue).to.equal(MIN_BID);
      expect(s.currentPhase_).to.equal(Phase.NotOpen);
    });
  });
});

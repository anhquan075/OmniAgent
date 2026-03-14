/**
 * refresh-testnet-mock-feeds.js
 *
 * Refreshes the MockChainlinkAggregator feed timestamp so the CircuitBreaker's
 * Signal A clears (stale-feed trip), then calls checkBreaker() to auto-recover.
 *
 * Usage:
 *   npx hardhat run scripts/refresh-testnet-mock-feeds.js --network bscTestnet
 *
 * Signal A trips when: block.timestamp - feed.updatedAt > chainlinkStalePeriod (3600s).
 * Fix: call setRound(1e8, block.timestamp) on the mock feed → Signal A clears.
 * Recovery: checkBreaker() auto-unpauses once all signals clear AND recoveryCooldown
 * (3600s) has elapsed since lastTripTimestamp.
 */

const { ethers } = require("hardhat");

const CIRCUIT_BREAKER_ADDR = "0x1E63C0F23D89eC3b58b696d7c17Bb0159A25DEF5";

const CIRCUIT_BREAKER_ABI = [
  "function chainlinkFeed() view returns (address)",
  "function paused() view returns (bool)",
  "function lastTripTimestamp() view returns (uint256)",
  "function recoveryCooldown() view returns (uint256)",
  "function checkBreaker() returns (bool)",
  "function previewBreaker() view returns (tuple(bool paused, bool signalA, bool signalB, bool signalC, uint256 lastTripTimestamp, uint256 recoveryTimestamp))",
];

const MOCK_FEED_ABI = [
  "function setRound(int256 answer_, uint256 updatedAt_) external",
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const breaker = new ethers.Contract(
    CIRCUIT_BREAKER_ADDR,
    CIRCUIT_BREAKER_ABI,
    signer
  );

  // ── 1. Read current breaker state ──────────────────────────────────────────
  const preview = await breaker.previewBreaker();
  const lastTrip = Number(preview.lastTripTimestamp);
  const cooldown = Number(await breaker.recoveryCooldown());
  const now = Math.floor(Date.now() / 1000);
  const recoveryAt = lastTrip + cooldown;
  const cooldownLeft = recoveryAt - now;

  console.log(
    "\n── CircuitBreaker state ──────────────────────────────────────"
  );
  console.log("  paused:    ", preview.paused);
  console.log("  signalA:   ", preview.signalA, "(Chainlink staleness)");
  console.log("  signalB:   ", preview.signalB, "(reserve ratio)");
  console.log("  signalC:   ", preview.signalC, "(virtual price drop)");
  console.log(
    "  lastTrip:  ",
    lastTrip ? new Date(lastTrip * 1000).toISOString() : "never"
  );
  console.log(
    "  recoveryAt:",
    lastTrip ? new Date(recoveryAt * 1000).toISOString() : "n/a"
  );
  console.log(
    "  cooldown left:",
    cooldownLeft > 0 ? `${cooldownLeft}s` : "elapsed ✓"
  );

  // ── 2. Refresh MockChainlink feed → clears Signal A ────────────────────────
  const feedAddr = await breaker.chainlinkFeed();
  console.log(
    "\n── MockChainlinkAggregator:",
    feedAddr,
    "──────────────────────"
  );

  const feed = new ethers.Contract(feedAddr, MOCK_FEED_ABI, signer);

  // price = $1.00 in 8-decimal Chainlink format, timestamp = now
  const freshAnswer = ethers.parseUnits("1", 8); // 100_000_000
  const tx = await feed.setRound(freshAnswer, now);
  await tx.wait();
  console.log("  setRound(1e8, now) → tx:", tx.hash);
  console.log("  Signal A will be clear on next breaker check ✓");

  // ── 3. Attempt checkBreaker() to auto-recover ──────────────────────────────
  console.log(
    "\n── Calling checkBreaker() ────────────────────────────────────"
  );
  if (cooldownLeft > 0) {
    console.log(`  ⚠ Cooldown not elapsed yet (${cooldownLeft}s remaining).`);
    console.log(
      "  Feed is now fresh — breaker will auto-recover in",
      cooldownLeft,
      "seconds."
    );
    console.log(
      "  Re-run this script after",
      new Date(recoveryAt * 1000).toLocaleTimeString(),
      "to finalize."
    );
  } else {
    const checkTx = await breaker.checkBreaker();
    await checkTx.wait();
    const stillPaused = await breaker.paused();
    console.log("  checkBreaker() → tx:", checkTx.hash);
    console.log("  paused after check:", stillPaused);
    if (!stillPaused) {
      console.log(
        "  ✓ CircuitBreaker recovered! Vault execution is unblocked."
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

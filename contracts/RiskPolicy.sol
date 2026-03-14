// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title RiskPolicy
 * @notice Global risk parameters and allocation targets for StrategyEngine.
 */
contract RiskPolicy {
    // --- Errors ---
    error RiskPolicy__ZeroCooldown();
    error RiskPolicy__VolatilityOrderInvalid();
    error RiskPolicy__ZeroDepegPrice();
    error RiskPolicy__SlippageTooHigh();
    error RiskPolicy__BountyTooHigh();
    error RiskPolicy__AllocationTooHigh();
    error RiskPolicy__AllocsNotMonotonic();
    error RiskPolicy__MinBountyExceedsMax();
    error RiskPolicy__ZeroAuctionDuration();
    error RiskPolicy__IdleBufferTooHigh();
    error RiskPolicy__SharpeWindowOutOfRange();
    error RiskPolicy__CombinedAllocationTooHigh();

    // ── v1 params ───────────────────────────────────────────────
    uint256 public immutable cooldown;
    uint256 public immutable guardedVolatilityBps;
    uint256 public immutable drawdownVolatilityBps;
    uint256 public immutable depegPrice;
    uint256 public immutable maxSlippageBps;
    uint256 public immutable maxBountyBps;
    uint256 public immutable normalAsterBps;
    uint256 public immutable guardedAsterBps;
    uint256 public immutable drawdownAsterBps;

    // ── v2 params ───────────────────────────────────────────────
    uint256 public immutable minBountyBps;
    uint256 public immutable auctionDurationSeconds;
    uint256 public immutable idleBufferBps;
    uint8   public immutable sharpeWindowSize;
    uint256 public immutable sharpeLowThreshold;

    // ── LP rail params ──────────────────────────────────────────
    uint256 public immutable normalLpBps;
    uint256 public immutable guardedLpBps;
    uint256 public immutable drawdownLpBps;

    uint256 public constant BPS_DENOMINATOR = 10_000;

    constructor(
        uint256 cooldown_,
        uint256 guardedVolatilityBps_,
        uint256 drawdownVolatilityBps_,
        uint256 depegPrice_,
        uint256 maxSlippageBps_,
        uint256 maxBountyBps_,
        uint256 normalAsterBps_,
        uint256 guardedAsterBps_,
        uint256 drawdownAsterBps_,
        uint256 minBountyBps_,
        uint256 auctionDurationSeconds_,
        uint256 idleBufferBps_,
        uint8   sharpeWindowSize_,
        uint256 sharpeLowThreshold_,
        uint256 normalLpBps_,
        uint256 guardedLpBps_,
        uint256 drawdownLpBps_
    ) {
        if (cooldown_ == 0) revert RiskPolicy__ZeroCooldown();
        if (guardedVolatilityBps_ > drawdownVolatilityBps_) revert RiskPolicy__VolatilityOrderInvalid();
        if (depegPrice_ == 0) revert RiskPolicy__ZeroDepegPrice();
        if (maxSlippageBps_ > 1000) revert RiskPolicy__SlippageTooHigh();
        if (maxBountyBps_ > 200) revert RiskPolicy__BountyTooHigh();
        if (normalAsterBps_ > BPS_DENOMINATOR) revert RiskPolicy__AllocationTooHigh();
        if (guardedAsterBps_ > BPS_DENOMINATOR) revert RiskPolicy__AllocationTooHigh();
        if (drawdownAsterBps_ > BPS_DENOMINATOR) revert RiskPolicy__AllocationTooHigh();

        if (normalAsterBps_ > guardedAsterBps_ || guardedAsterBps_ > drawdownAsterBps_) {
            revert RiskPolicy__AllocsNotMonotonic();
        }

        if (minBountyBps_ > maxBountyBps_) revert RiskPolicy__MinBountyExceedsMax();
        if (auctionDurationSeconds_ == 0) revert RiskPolicy__ZeroAuctionDuration();
        if (idleBufferBps_ > 2000) revert RiskPolicy__IdleBufferTooHigh();
        if (sharpeWindowSize_ < 3 || sharpeWindowSize_ > 30) revert RiskPolicy__SharpeWindowOutOfRange();

        if (normalLpBps_ + normalAsterBps_ > BPS_DENOMINATOR) revert RiskPolicy__CombinedAllocationTooHigh();
        if (guardedLpBps_ + guardedAsterBps_ > BPS_DENOMINATOR) revert RiskPolicy__CombinedAllocationTooHigh();
        if (drawdownLpBps_ + drawdownAsterBps_ > BPS_DENOMINATOR) revert RiskPolicy__CombinedAllocationTooHigh();

        if (normalLpBps_ < guardedLpBps_ || guardedLpBps_ < drawdownLpBps_) {
            revert RiskPolicy__AllocsNotMonotonic();
        }

        cooldown = cooldown_;
        guardedVolatilityBps = guardedVolatilityBps_;
        drawdownVolatilityBps = drawdownVolatilityBps_;
        depegPrice = depegPrice_;
        maxSlippageBps = maxSlippageBps_;
        maxBountyBps = maxBountyBps_;
        normalAsterBps = normalAsterBps_;
        guardedAsterBps = guardedAsterBps_;
        drawdownAsterBps = drawdownAsterBps_;
        minBountyBps = minBountyBps_;
        auctionDurationSeconds = auctionDurationSeconds_;
        idleBufferBps = idleBufferBps_;
        sharpeWindowSize = sharpeWindowSize_;
        sharpeLowThreshold = sharpeLowThreshold_;
        normalLpBps = normalLpBps_;
        guardedLpBps = guardedLpBps_;
        drawdownLpBps = drawdownLpBps_;
    }
}

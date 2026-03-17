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
    uint256 public immutable normalWDKBps;
    uint256 public immutable guardedWDKBps;
    uint256 public immutable drawdownWDKBps;

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

    // ── Lending rail params (Phase 1) ───────────────────────────
    uint256 public immutable maxAaveAllocationBps;
    uint256 public immutable minHealthFactor;

    uint256 public constant BPS_DENOMINATOR = 10_000;

    constructor(
        uint256 cooldown_,
        uint256 guardedVolatilityBps_,
        uint256 drawdownVolatilityBps_,
        uint256 depegPrice_,
        uint256 maxSlippageBps_,
        uint256 maxBountyBps_,
        uint256 normalWDKBps_,
        uint256 guardedWDKBps_,
        uint256 drawdownWDKBps_,
        uint256 minBountyBps_,
        uint256 auctionDurationSeconds_,
        uint256 idleBufferBps_,
        uint8   sharpeWindowSize_,
        uint256 sharpeLowThreshold_,
        uint256 normalLpBps_,
        uint256 guardedLpBps_,
        uint256 drawdownLpBps_,
        uint256 maxAaveAllocationBps_,
        uint256 minHealthFactor_
    ) {
        if (cooldown_ == 0) revert RiskPolicy__ZeroCooldown();
        if (guardedVolatilityBps_ > drawdownVolatilityBps_) revert RiskPolicy__VolatilityOrderInvalid();
        if (depegPrice_ == 0) revert RiskPolicy__ZeroDepegPrice();
        if (maxSlippageBps_ > 1000) revert RiskPolicy__SlippageTooHigh();
        if (maxBountyBps_ > 200) revert RiskPolicy__BountyTooHigh();
        if (normalWDKBps_ > BPS_DENOMINATOR) revert RiskPolicy__AllocationTooHigh();
        if (guardedWDKBps_ > BPS_DENOMINATOR) revert RiskPolicy__AllocationTooHigh();
        if (drawdownWDKBps_ > BPS_DENOMINATOR) revert RiskPolicy__AllocationTooHigh();

        if (normalWDKBps_ > guardedWDKBps_ || guardedWDKBps_ > drawdownWDKBps_) {
            revert RiskPolicy__AllocsNotMonotonic();
        }

        if (minBountyBps_ > maxBountyBps_) revert RiskPolicy__MinBountyExceedsMax();
        if (auctionDurationSeconds_ == 0) revert RiskPolicy__ZeroAuctionDuration();
        if (idleBufferBps_ > 2000) revert RiskPolicy__IdleBufferTooHigh();
        if (sharpeWindowSize_ < 3 || sharpeWindowSize_ > 30) revert RiskPolicy__SharpeWindowOutOfRange();

        if (normalLpBps_ + normalWDKBps_ > BPS_DENOMINATOR) revert RiskPolicy__CombinedAllocationTooHigh();
        if (guardedLpBps_ + guardedWDKBps_ > BPS_DENOMINATOR) revert RiskPolicy__CombinedAllocationTooHigh();
        if (drawdownLpBps_ + drawdownWDKBps_ > BPS_DENOMINATOR) revert RiskPolicy__CombinedAllocationTooHigh();

        if (normalLpBps_ < guardedLpBps_ || guardedLpBps_ < drawdownLpBps_) {
            revert RiskPolicy__AllocsNotMonotonic();
        }

        if (maxAaveAllocationBps_ > BPS_DENOMINATOR) revert RiskPolicy__AllocationTooHigh();

        cooldown = cooldown_;
        guardedVolatilityBps = guardedVolatilityBps_;
        drawdownVolatilityBps = drawdownVolatilityBps_;
        depegPrice = depegPrice_;
        maxSlippageBps = maxSlippageBps_;
        maxBountyBps = maxBountyBps_;
        normalWDKBps = normalWDKBps_;
        guardedWDKBps = guardedWDKBps_;
        drawdownWDKBps = drawdownWDKBps_;
        minBountyBps = minBountyBps_;
        auctionDurationSeconds = auctionDurationSeconds_;
        idleBufferBps = idleBufferBps_;
        sharpeWindowSize = sharpeWindowSize_;
        sharpeLowThreshold = sharpeLowThreshold_;
        normalLpBps = normalLpBps_;
        guardedLpBps = guardedLpBps_;
        drawdownLpBps = drawdownLpBps_;
        maxAaveAllocationBps = maxAaveAllocationBps_;
        minHealthFactor = minHealthFactor_;
    }
}

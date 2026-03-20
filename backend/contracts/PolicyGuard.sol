// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title PolicyGuard
 * @notice On-chain safety boundary for OmniAgent autonomous operations.
 *         Modeled after shll-safe-agent's PolicyGuard pattern.
 *
 * @dev All write operations must pass through validate() before execution.
 *      This contract cannot be bypassed by code modification — reverts are on-chain.
 */
contract PolicyGuard {
    // ── Errors ────────────────────────────────────────────────────
    error PolicyGuard__EmergencyActive();
    error PolicyGuard__NotOperator();
    error PolicyGuard__SpendingLimitExceeded(uint256 requested, uint256 remaining);
    error PolicyGuard__DailyLimitExceeded(uint256 requested, uint256 remaining);
    error PolicyGuard__ReceiverBlocked(address receiver);
    error PolicyGuard__ReceiverNotWhitelisted(address receiver);
    error PolicyGuard__CooldownActive(uint256 secondsLeft);
    error PolicyGuard__MaxPercentageExceeded(uint256 bps, uint256 maxBps);

    // ── Events ────────────────────────────────────────────────────
    event OperatorUpdated(address indexed oldOperator, address indexed newOperator);
    event ReceiverWhitelisted(address indexed receiver);
    event ReceiverRemoved(address indexed receiver);
    event SpendingLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event DailyLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event MaxPercentageUpdated(uint256 oldBps, uint256 newBps);
    event CooldownUpdated(uint256 oldCooldown, uint256 newCooldown);
    event EmergencyBreakerToggled(bool active);
    event PolicyCommitted(uint256 timestamp, uint256 dailySpent);

    // ── State ─────────────────────────────────────────────────────
    address public operator;
    bool public emergencyBreaker;

    // Spending limits (in USDT, 18 decimals)
    uint256 public maxSingleTxUsdt;
    uint256 public dailyLimitUsdt;
    uint256 public dailySpentUsdt;
    uint256 public lastResetDay;

    // Max percentage of portfolio per trade (basis points, 10000 = 100%)
    uint256 public maxPercentageBps;

    // Cooldown between trades (seconds)
    uint256 public cooldownSeconds;
    uint256 public lastTradeTimestamp;

    // Receiver whitelist
    mapping(address => bool) public whitelistedReceivers;
    mapping(address => bool) public blockedReceivers;

    // ── Constructor ───────────────────────────────────────────────
    constructor(
        address operator_,
        uint256 maxSingleTxUsdt_,
        uint256 dailyLimitUsdt_,
        uint256 maxPercentageBps_,
        uint256 cooldownSeconds_
    ) {
        if (operator_ == address(0)) revert PolicyGuard__NotOperator();
        if (maxSingleTxUsdt_ == 0) revert PolicyGuard__SpendingLimitExceeded(0, 0);
        if (dailyLimitUsdt_ == 0) revert PolicyGuard__DailyLimitExceeded(0, 0);
        if (maxPercentageBps_ > 10000) revert PolicyGuard__MaxPercentageExceeded(maxPercentageBps_, 10000);

        operator = operator_;
        maxSingleTxUsdt = maxSingleTxUsdt_;
        dailyLimitUsdt = dailyLimitUsdt_;
        maxPercentageBps = maxPercentageBps_;
        cooldownSeconds = cooldownSeconds_;
        lastResetDay = block.timestamp / 1 days;
    }

    // ── Validation ────────────────────────────────────────────────

    /**
     * @notice Validate a transaction before execution.
     * @param receiver Destination address for the funds
     * @param amountUsdt Amount in USDT (18 decimals)
     * @param portfolioValueUsdt Current portfolio value in USDT (18 decimals)
     * @return approved Whether the transaction is allowed
     */
    function validate(
        address receiver,
        uint256 amountUsdt,
        uint256 portfolioValueUsdt
    ) external returns (bool approved) {
        // 1. Emergency breaker
        if (emergencyBreaker) revert PolicyGuard__EmergencyActive();

        // 2. Cooldown check
        if (cooldownSeconds > 0 && lastTradeTimestamp > 0) {
            uint256 elapsed = block.timestamp - lastTradeTimestamp;
            if (elapsed < cooldownSeconds) {
                revert PolicyGuard__CooldownActive(cooldownSeconds - elapsed);
            }
        }

        // 3. Daily limit reset
        _resetDailyIfNeeded();

        // 4. Receiver validation
        if (blockedReceivers[receiver]) {
            revert PolicyGuard__ReceiverBlocked(receiver);
        }

        // Only enforce whitelist for non-zero amounts
        if (amountUsdt > 0 && !whitelistedReceivers[receiver] && receiver != address(0)) {
            revert PolicyGuard__ReceiverNotWhitelisted(receiver);
        }

        // 5. Single transaction limit
        if (amountUsdt > maxSingleTxUsdt) {
            revert PolicyGuard__SpendingLimitExceeded(amountUsdt, maxSingleTxUsdt);
        }

        // 6. Daily limit
        if (dailySpentUsdt + amountUsdt > dailyLimitUsdt) {
            revert PolicyGuard__DailyLimitExceeded(amountUsdt, dailyLimitUsdt - dailySpentUsdt);
        }

        // 7. Max percentage of portfolio
        if (portfolioValueUsdt > 0) {
            uint256 tradeBps = (amountUsdt * 10000) / portfolioValueUsdt;
            if (tradeBps > maxPercentageBps) {
                revert PolicyGuard__MaxPercentageExceeded(tradeBps, maxPercentageBps);
            }
        }

        return true;
    }

    /**
     * @notice Commit policy state after successful execution.
     * @dev Called by AgentNFA after each write operation.
     */
    function commit(uint256 amountUsdt) external {
        _resetDailyIfNeeded();
        dailySpentUsdt += amountUsdt;
        lastTradeTimestamp = block.timestamp;
        emit PolicyCommitted(block.timestamp, dailySpentUsdt);
    }

    // ── Admin ─────────────────────────────────────────────────────

    function setOperator(address newOperator) external {
        require(msg.sender == operator, "Only operator");
        require(newOperator != address(0), "Zero address");
        address old = operator;
        operator = newOperator;
        emit OperatorUpdated(old, newOperator);
    }

    function whitelistReceiver(address receiver) external {
        require(msg.sender == operator, "Only operator");
        whitelistedReceivers[receiver] = true;
        emit ReceiverWhitelisted(receiver);
    }

    function removeReceiver(address receiver) external {
        require(msg.sender == operator, "Only operator");
        whitelistedReceivers[receiver] = false;
        emit ReceiverRemoved(receiver);
    }

    function blockReceiver(address receiver) external {
        require(msg.sender == operator, "Only operator");
        blockedReceivers[receiver] = true;
        emit ReceiverRemoved(receiver);
    }

    function setSpendingLimits(uint256 singleTx, uint256 daily) external {
        require(msg.sender == operator, "Only operator");
        uint256 oldSingle = maxSingleTxUsdt;
        uint256 oldDaily = dailyLimitUsdt;
        maxSingleTxUsdt = singleTx;
        dailyLimitUsdt = daily;
        emit SpendingLimitUpdated(oldSingle, singleTx);
        emit DailyLimitUpdated(oldDaily, daily);
    }

    function setMaxPercentage(uint256 bps) external {
        require(msg.sender == operator, "Only operator");
        require(bps <= 10000, "Over 100%");
        uint256 old = maxPercentageBps;
        maxPercentageBps = bps;
        emit MaxPercentageUpdated(old, bps);
    }

    function setCooldown(uint256 seconds_) external {
        require(msg.sender == operator, "Only operator");
        uint256 old = cooldownSeconds;
        cooldownSeconds = seconds_;
        emit CooldownUpdated(old, seconds_);
    }

    function toggleEmergencyBreaker(bool active) external {
        require(msg.sender == operator, "Only operator");
        emergencyBreaker = active;
        emit EmergencyBreakerToggled(active);
    }

    // ── Internal ──────────────────────────────────────────────────

    function _resetDailyIfNeeded() internal {
        uint256 today = block.timestamp / 1 days;
        if (today != lastResetDay) {
            dailySpentUsdt = 0;
            lastResetDay = today;
        }
    }

    // ── View ──────────────────────────────────────────────────────

    function getDailyStats() external view returns (
        uint256 spent,
        uint256 remaining,
        uint256 limit,
        uint256 resetDay
    ) {
        uint256 today = block.timestamp / 1 days;
        uint256 spentToday = today == lastResetDay ? dailySpentUsdt : 0;
        return (spentToday, dailyLimitUsdt - spentToday, dailyLimitUsdt, today);
    }

    function isWhitelisted(address receiver) external view returns (bool) {
        return whitelistedReceivers[receiver];
    }

    function isBlocked(address receiver) external view returns (bool) {
        return blockedReceivers[receiver];
    }
}

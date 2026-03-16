// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ICircuitBreaker} from "./interfaces/ICircuitBreaker.sol";
import {IChainlinkAggregator} from "./interfaces/IChainlinkAggregator.sol";
import {IStableSwapPool} from "./interfaces/IStableSwapPool.sol";

/// @title CircuitBreaker — 3-signal auto-pause / auto-recover
/// @notice Trips on ANY single signal. Recovers when ALL clear + cooldown elapsed.
/// @custom:security-contact security@wdkpilot.xyz
contract CircuitBreaker is ICircuitBreaker {
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ── immutables ──
    IChainlinkAggregator public immutable chainlinkFeed;
    IStableSwapPool public immutable stableSwapPool;
    uint256 public immutable signalAThresholdBps; // Chainlink USDT/USD deviation
    uint256 public immutable signalBThresholdBps; // reserve-ratio deviation
    uint256 public immutable signalCThresholdBps; // virtual-price drop
    uint256 public immutable recoveryCooldown; // seconds
    /// @notice Chainlink answer older than this is treated as stale (trips Signal A conservatively)
    uint256 public immutable chainlinkStalePeriod;

    // ── storage ──
    bool public paused;
    uint256 public lastTripTimestamp;
    uint256 public lastVirtualPrice;
    address public owner;

    // ── errors ──
    error CircuitBreaker__ZeroAddress();
    error CircuitBreaker__InvalidThreshold();
    error CircuitBreaker__ZeroCooldown();
    error CircuitBreaker__NotPaused();

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(
        address _chainlinkFeed,
        address _stableSwapPool,
        uint256 _signalAThresholdBps,
        uint256 _signalBThresholdBps,
        uint256 _signalCThresholdBps,
        uint256 _recoveryCooldown,
        uint256 _chainlinkStalePeriod
    ) {
        if (_chainlinkFeed == address(0)) revert CircuitBreaker__ZeroAddress();
        if (_stableSwapPool == address(0)) revert CircuitBreaker__ZeroAddress();
        if (
            _signalAThresholdBps == 0 || _signalAThresholdBps >= BPS_DENOMINATOR
        ) revert CircuitBreaker__InvalidThreshold();
        if (
            _signalBThresholdBps == 0 || _signalBThresholdBps >= BPS_DENOMINATOR
        ) revert CircuitBreaker__InvalidThreshold();
        if (
            _signalCThresholdBps == 0 || _signalCThresholdBps >= BPS_DENOMINATOR
        ) revert CircuitBreaker__InvalidThreshold();
        if (_recoveryCooldown == 0) revert CircuitBreaker__ZeroCooldown();

        chainlinkFeed = IChainlinkAggregator(_chainlinkFeed);
        stableSwapPool = IStableSwapPool(_stableSwapPool);
        signalAThresholdBps = _signalAThresholdBps;
        signalBThresholdBps = _signalBThresholdBps;
        signalCThresholdBps = _signalCThresholdBps;
        recoveryCooldown = _recoveryCooldown;
        chainlinkStalePeriod = _chainlinkStalePeriod == 0
            ? 3600
            : _chainlinkStalePeriod;

        lastVirtualPrice = IStableSwapPool(_stableSwapPool).get_virtual_price();
        owner = msg.sender;
    }

    /*//////////////////////////////////////////////////////////////
                           PUBLIC MUTATIVE
    //////////////////////////////////////////////////////////////*/

    /// @notice Manually unpause the breaker (owner only)
    function unpause() external onlyOwner {
        paused = false;
        emit BreakerRecovered(0);
    }

    /// @inheritdoc ICircuitBreaker
    function checkBreaker() external returns (bool) {
        (
            bool sigA,
            bool sigB,
            bool sigC,
            uint256 currentVP
        ) = _evaluateSignals();

        // always track virtual price
        lastVirtualPrice = currentVP;

        bool anyTriggered = sigA || sigB || sigC;

        if (anyTriggered) {
            if (!paused) {
                paused = true;
                lastTripTimestamp = block.timestamp;
                emit BreakerTripped(sigA, sigB, sigC);
            }
        } else if (
            paused && block.timestamp >= lastTripTimestamp + recoveryCooldown
        ) {
            uint256 duration = block.timestamp - lastTripTimestamp;
            paused = false;
            emit BreakerRecovered(duration);
        }

        return paused;
    }

    /*//////////////////////////////////////////////////////////////
                                 VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc ICircuitBreaker
    function previewBreaker()
        external
        view
        returns (BreakerStatus memory status)
    {
        (bool sigA, bool sigB, bool sigC, ) = _evaluateSignals();
        status.paused = paused;
        status.signalA = sigA;
        status.signalB = sigB;
        status.signalC = sigC;
        status.lastTripTimestamp = lastTripTimestamp;
        status.recoveryTimestamp = paused
            ? lastTripTimestamp + recoveryCooldown
            : 0;
    }

    /// @inheritdoc ICircuitBreaker
    function isPaused() external view returns (bool) {
        return paused;
    }

    /*//////////////////////////////////////////////////////////////
                              INTERNAL LOGIC
    //////////////////////////////////////////////////////////////*/

    function _evaluateSignals()
        internal
        view
        returns (bool sigA, bool sigB, bool sigC, uint256 currentVP)
    {
        // Signal A — Chainlink USDT/USD deviation from $1.00
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = chainlinkFeed.latestRoundData();

        // Treat feed as unavailable / stale — default trip signal A to be safe
        bool feedStale = (answer <= 0 ||
            updatedAt == 0 ||
            answeredInRound < roundId ||
            block.timestamp - updatedAt > chainlinkStalePeriod);

        if (feedStale) {
            sigA = true; // conservative: treat stale/invalid feed as signal
        } else {
            uint256 price = uint256(answer); // safe: answer > 0 checked above
            uint256 target = 1e8;
            uint256 devA = price > target ? price - target : target - price;
            sigA = ((devA * BPS_DENOMINATOR) / target) > signalAThresholdBps;
        }

        // Signal B — StableSwap reserve-ratio deviation from 1:1
        (bool reserveOk, uint256 bal0, uint256 bal1) = _readPoolBalances();
        if (!reserveOk || bal1 == 0) {
            sigB = true; // empty pool is a trip condition
        } else {
            uint256 impliedPrice = (bal0 * 1e18) / bal1; // USDT per WDKS
            uint256 rTarget = 1e18;
            uint256 devB = impliedPrice > rTarget
                ? impliedPrice - rTarget
                : rTarget - impliedPrice;
            sigB = ((devB * BPS_DENOMINATOR) / rTarget) > signalBThresholdBps;
        }

        // Signal C — virtual-price drop
        currentVP = stableSwapPool.get_virtual_price();
        sigC = false;
        if (lastVirtualPrice > 0 && currentVP < lastVirtualPrice) {
            uint256 drop = lastVirtualPrice - currentVP;
            sigC =
                ((drop * BPS_DENOMINATOR) / lastVirtualPrice) >
                signalCThresholdBps;
        }
    }

    function _readPoolBalances()
        internal
        view
        returns (bool ok, uint256 bal0, uint256 bal1)
    {
        address poolAddr = address(stableSwapPool);

        (bool sGet, bytes memory dGet) = poolAddr.staticcall(
            abi.encodeWithSignature("get_balances()")
        );
        if (sGet && dGet.length >= 64) {
            uint256[2] memory b = abi.decode(dGet, (uint256[2]));
            return (true, b[0], b[1]);
        }

        (bool s0, bytes memory d0) = poolAddr.staticcall(
            abi.encodeWithSignature("balances(uint256)", 0)
        );
        (bool s1, bytes memory d1) = poolAddr.staticcall(
            abi.encodeWithSignature("balances(uint256)", 1)
        );
        if (s0 && s1 && d0.length >= 32 && d1.length >= 32) {
            return (true, abi.decode(d0, (uint256)), abi.decode(d1, (uint256)));
        }

        return (false, 0, 0);
    }
}

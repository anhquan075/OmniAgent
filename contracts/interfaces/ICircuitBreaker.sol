// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICircuitBreaker — 3-signal auto-pause / auto-recover interface
interface ICircuitBreaker {
    struct BreakerStatus {
        bool paused;
        bool signalA; // Chainlink USDT/USD deviation
        bool signalB; // StableSwap reserve-ratio deviation
        bool signalC; // StableSwap virtual-price drop
        uint256 lastTripTimestamp;
        uint256 recoveryTimestamp; // 0 when not paused
    }

    event BreakerTripped(bool signalA, bool signalB, bool signalC);
    event BreakerRecovered(uint256 pausedDuration);

    function checkBreaker() external returns (bool paused);
    function previewBreaker() external view returns (BreakerStatus memory);
    function isPaused() external view returns (bool);
}

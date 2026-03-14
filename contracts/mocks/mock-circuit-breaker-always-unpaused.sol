// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICircuitBreaker} from "../interfaces/ICircuitBreaker.sol";

/// @title MockCircuitBreaker — test double for ICircuitBreaker
/// @dev Permissioned paused setter for unit tests; defaults to not paused.
contract MockCircuitBreaker is ICircuitBreaker {
    bool private _paused;

    function checkBreaker() external returns (bool) {
        return _paused;
    }

    function isPaused() external view returns (bool) {
        return _paused;
    }

    function previewBreaker() external view returns (BreakerStatus memory status) {
        status.paused = _paused;
    }

    /// @notice Test helper — set paused state directly
    function setPaused(bool paused_) external {
        _paused = paused_;
    }
}

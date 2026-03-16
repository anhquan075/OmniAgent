// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title TransientReentrancyGuard
 * @notice A gas-efficient reentrancy guard using EIP-1153 transient storage.
 * @dev Uses TSTORE/TLOAD opcodes which are available in Solidity 0.8.24+ when targeting Cancun.
 */
abstract contract TransientReentrancyGuard {
    // slot for the reentrancy guard
    // keccak256("TransientReentrancyGuard.slot")
    uint256 private constant REENTRANCY_GUARD_SLOT = 0x8e9428af6f6bc35957f11299da3a9da31451dc0ca7a062757ceec659527f95d2;

    error ReentrancyGuard__ReentrantCall();

    modifier nonReentrant() {
        _enterNonReentrant();
        _;
        _exitNonReentrant();
    }

    function _enterNonReentrant() internal {
        assembly {
            if tload(REENTRANCY_GUARD_SLOT) {
                // Revert with ReentrancyGuard__ReentrantCall()
                mstore(0x00, 0x16262d79) // Selector for ReentrancyGuard__ReentrantCall()
                revert(0x1c, 0x04)
            }
            tstore(REENTRANCY_GUARD_SLOT, 1)
        }
    }

    function _exitNonReentrant() internal {
        assembly {
            tstore(REENTRANCY_GUARD_SLOT, 0)
        }
    }
}

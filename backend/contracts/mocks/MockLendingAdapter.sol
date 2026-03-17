// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ManagedAdapter} from "../ManagedAdapter.sol";

contract MockLendingAdapter is ManagedAdapter {
    uint256 public healthFactor = 2e18;

    constructor(address asset_, address initialOwner_) ManagedAdapter(asset_, initialOwner_) {}

    function getHealthFactor() external view returns (uint256) {
        return healthFactor;
    }

    function setHealthFactor(uint256 h) external {
        healthFactor = h;
    }
}

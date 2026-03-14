// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPegArbExecutor — permissionless atomic stableswap arb
interface IPegArbExecutor {
    enum ArbDirection { None, BuyUSDF, SellUSDF }

    struct ArbPreview {
        ArbDirection direction;
        uint256 estimatedProfitBps;
        uint256 tradeSize;
        uint256 poolPrice; // 1e18 scale
    }

    event ArbExecuted(
        ArbDirection indexed direction,
        uint256 tradeSize,
        uint256 profit,
        uint256 bountyPaid,
        address indexed executor
    );

    function executeArb() external returns (uint256 profit);
    function previewArb() external view returns (ArbPreview memory);
}

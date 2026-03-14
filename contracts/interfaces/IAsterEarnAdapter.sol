// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IManagedAdapter} from "./IManagedAdapter.sol";

/// @title IAsterEarnAdapter — async request/claim withdrawal adapter
interface IAsterEarnAdapter is IManagedAdapter {
    struct WithdrawRequest {
        uint256 requestId;
        uint256 amount;
        uint256 maturityTimestamp;
        bool claimed;
    }

    event WithdrawRequested(uint256 indexed requestId, uint256 amount, uint256 maturityTimestamp);
    event WithdrawClaimed(uint256 indexed requestId, uint256 amount);

    function requestWithdraw(uint256 amount) external returns (uint256 requestId);
    function claimWithdraw(uint256 index) external returns (uint256 claimed);
    function claimAllMatured() external returns (uint256 totalClaimed);
    function totalPending() external view returns (uint256);
    function pendingWithdrawals() external view returns (WithdrawRequest[] memory);
    function maturedWithdrawals() external view returns (uint256 count, uint256 totalAmount);
}

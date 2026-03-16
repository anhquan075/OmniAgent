// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title MockAsyncWDKMinter — simulates async request/claim withdrawal
contract MockAsyncWDKMinter {
    struct Request {
        uint256 amount;
        uint256 maturityTimestamp;
        bool claimed;
    }

    IERC20 public token;
    uint256 public vestingPeriod;
    uint256 public nextRequestId;

    mapping(address => uint256) public deposits;
    mapping(uint256 => Request) public requests;
    mapping(uint256 => address) public requestOwner;

    constructor(address _token, uint256 _vestingPeriod) {
        token = IERC20(_token);
        vestingPeriod = _vestingPeriod;
    }

    /// @dev Deposit tokens (called via selector from adapter)
    function deposit(uint256 amount) external returns (bool) {
        token.transferFrom(msg.sender, address(this), amount);
        deposits[msg.sender] += amount;
        return true;
    }

    /// @dev Return managed balance for an account
    function managedAssets(address account) external view returns (uint256) {
        return deposits[account];
    }

    /// @dev Create async withdrawal request
    function requestWithdraw(uint256 amount) external returns (uint256 requestId) {
        require(deposits[msg.sender] >= amount, "insufficient");
        deposits[msg.sender] -= amount;

        requestId = nextRequestId++;
        requests[requestId] = Request({
            amount: amount,
            maturityTimestamp: block.timestamp + vestingPeriod,
            claimed: false
        });
        requestOwner[requestId] = msg.sender;
    }

    /// @dev Claim matured withdrawal
    function claimWithdraw(uint256 requestId) external returns (bool) {
        Request storage req = requests[requestId];
        require(req.amount > 0, "no request");
        require(!req.claimed, "already claimed");
        require(block.timestamp >= req.maturityTimestamp, "not matured");

        req.claimed = true;
        token.transfer(requestOwner[requestId], req.amount);
        return true;
    }

    /// @dev Query request details
    function getWithdrawRequest(uint256 requestId)
        external
        view
        returns (uint256 amount, uint256 maturityTimestamp, bool claimed)
    {
        Request storage req = requests[requestId];
        return (req.amount, req.maturityTimestamp, req.claimed);
    }

    // ── test helper ──
    function setVestingPeriod(uint256 _period) external {
        vestingPeriod = _period;
    }
}

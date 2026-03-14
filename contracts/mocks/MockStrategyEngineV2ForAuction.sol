// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Mock StrategyEngine for ExecutionAuction tests.
///      Holds USDT to simulate bounty payments on executeCycle().
contract MockStrategyEngine {
    IERC20  public usdt;
    uint256 public bountyAmount;  // USDT paid to msg.sender on executeCycle()
    bool    public ready;         // timeUntilNextCycle() returns 0 when true
    bool    public shouldRevert;  // simulate circuit breaker trip
    uint256 public cycleCount;

    constructor(address usdt_) {
        usdt  = IERC20(usdt_);
        ready = true;
    }

    /// @dev Simulates engine cooldown: returns 0 when ready, 300 when not
    function timeUntilNextCycle() external view returns (uint256) {
        return ready ? 0 : 300;
    }

    /// @dev Simulates rebalance cycle — pays bounty to msg.sender from engine's balance
    function executeCycle() external {
        require(!shouldRevert, "MockEngine: breaker tripped");
        require(ready,         "MockEngine: not ready");
        cycleCount++;
        if (bountyAmount > 0 && usdt.balanceOf(address(this)) >= bountyAmount) {
            usdt.transfer(msg.sender, bountyAmount);
        }
    }

    // ─── Test helpers ────────────────────────────────────────────────────────

    function setReady(bool r) external { ready = r; }
    function setShouldRevert(bool v) external { shouldRevert = v; }
    function setBounty(uint256 b) external { bountyAmount = b; }

    /// @dev Fund bounty pool — test must approve before calling
    function fundBounty(uint256 amount) external {
        usdt.transferFrom(msg.sender, address(this), amount);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title MockMasterChef
/// @notice Test double for PancakeSwap MasterChef V3 staking contract
contract MockMasterChef {
    IERC20 public immutable cake;
    
    struct UserInfo {
        uint256 amount;         // LP tokens staked
        uint256 rewardDebt;     // Reward debt for calculation
        uint256 lastRewardBlock; // Last block rewards were calculated
    }
    
    struct PoolInfo {
        address lpToken;
        bool active;
    }
    
    mapping(uint256 => PoolInfo) public poolInfo;
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    
    uint256 public rewardsPerBlock;
    uint256 public poolCount;
    
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    
    constructor(address _cake) {
        cake = IERC20(_cake);
    }
    
    /// @notice Add a new LP pool
    function addPool(address lpToken) external {
        poolInfo[poolCount] = PoolInfo({
            lpToken: lpToken,
            active: true
        });
        poolCount++;
    }
    
    /// @notice Set rewards per block (for testing)
    function setRewardsPerBlock(uint256 _rewardsPerBlock) external {
        rewardsPerBlock = _rewardsPerBlock;
    }
    
    /// @notice Deposit LP tokens and harvest rewards
    /// @dev This follows PancakeSwap MasterChef pattern: deposit(0) harvests without depositing
    function deposit(uint256 pid, uint256 amount) external {
        PoolInfo memory pool = poolInfo[pid];
        require(pool.active, "Pool not active");
        
        UserInfo storage user = userInfo[pid][msg.sender];
        
        // Calculate and send pending rewards
        uint256 pending = _calculatePending(pid, msg.sender);
        if (pending > 0) {
            cake.transfer(msg.sender, pending);
        }
        
        // Transfer LP tokens if depositing
        if (amount > 0) {
            IERC20(pool.lpToken).transferFrom(msg.sender, address(this), amount);
            user.amount += amount;
        }
        
        // Update reward debt
        user.rewardDebt = user.amount;
        user.lastRewardBlock = block.number;
        
        emit Deposit(msg.sender, pid, amount);
    }
    
    /// @notice Withdraw LP tokens
    function withdraw(uint256 pid, uint256 amount) external {
        PoolInfo memory pool = poolInfo[pid];
        UserInfo storage user = userInfo[pid][msg.sender];
        
        require(user.amount >= amount, "Insufficient balance");
        
        // Calculate and send pending rewards
        uint256 pending = _calculatePending(pid, msg.sender);
        if (pending > 0) {
            cake.transfer(msg.sender, pending);
        }
        
        // Transfer LP tokens
        if (amount > 0) {
            user.amount -= amount;
            IERC20(pool.lpToken).transfer(msg.sender, amount);
        }
        
        // Update reward debt
        user.rewardDebt = user.amount;
        user.lastRewardBlock = block.number;
        
        emit Withdraw(msg.sender, pid, amount);
    }
    
    /// @notice View pending CAKE rewards
    function pendingCake(uint256 pid, address _user) external view returns (uint256) {
        return _calculatePending(pid, _user);
    }
    
    /// @notice Calculate pending rewards based on blocks elapsed
    function _calculatePending(uint256 pid, address _user) internal view returns (uint256) {
        UserInfo memory user = userInfo[pid][_user];
        
        if (user.amount == 0 || rewardsPerBlock == 0) {
            return 0;
        }
        
        uint256 blocksSinceLastReward = block.number - user.lastRewardBlock;
        return blocksSinceLastReward * rewardsPerBlock;
    }
    
    /// @notice Test helper to set pending rewards for a user
    function setPendingRewards(uint256 pid, address _user, uint256 amount) external {
        // Adjust lastRewardBlock to simulate rewards
        UserInfo storage user = userInfo[pid][_user];
        if (rewardsPerBlock > 0) {
            uint256 blocksNeeded = amount / rewardsPerBlock;
            user.lastRewardBlock = block.number - blocksNeeded;
        }
    }
}


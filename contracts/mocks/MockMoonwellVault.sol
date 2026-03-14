// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

contract MockMoonwellVault is ERC4626 {
    uint256 public constant APR = 8; // 8% APR
    uint256 public lastUpdateTime;
    
    constructor(IERC20 _asset) 
        ERC4626(_asset) 
        ERC20("Mock Moonwell USDC", "mUSDC") 
    {
        lastUpdateTime = block.timestamp;
    }
    
    function simulateYield() external {
        uint256 timeElapsed = block.timestamp - lastUpdateTime;
        uint256 currentBalance = IERC20(asset()).balanceOf(address(this));
        if (currentBalance == 0) {
            lastUpdateTime = block.timestamp;
            return;
        }
        
        // Accrue yield: assets * APR * time / 365 days
        uint256 yield = (currentBalance * APR * timeElapsed) / (365 days * 100);
        
        if (yield > 0) {
            // Mint yield to vault
            IMockUSDC(address(asset())).mint(address(this), yield);
        }
        lastUpdateTime = block.timestamp;
    }
}

interface IMockUSDC {
    function mint(address to, uint256 amount) external;
}

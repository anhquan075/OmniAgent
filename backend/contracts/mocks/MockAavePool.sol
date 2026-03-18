// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MockERC20} from "./MockERC20.sol";

contract MockAavePool {
    using SafeERC20 for IERC20;

    address public asset;
    address public aToken;
    
    mapping(address => uint256) public deposits;
    mapping(address => uint256) public borrows;

    constructor(address asset_, address aToken_) {
        asset = asset_;
        aToken = aToken_;
    }

    function supply(address asset_, uint256 amount, address onBehalfOf, uint16) external {
        require(asset_ == asset, "Wrong asset");
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        deposits[onBehalfOf] += amount;
        MockERC20(aToken).mint(onBehalfOf, amount);
    }

    function withdraw(address asset_, uint256 amount, address to) external returns (uint256) {
        require(asset_ == asset, "Wrong asset");
        require(deposits[msg.sender] >= amount, "Insufficient deposits");
        deposits[msg.sender] -= amount;
        MockERC20(aToken).burn(msg.sender, amount);
        IERC20(asset).safeTransfer(to, amount);
        return amount;
    }

    function borrow(address asset_, uint256 amount, address onBehalfOf) external {
        require(asset_ == asset, "Wrong asset");
        require(deposits[onBehalfOf] >= amount, "Insufficient collateral");
        borrows[onBehalfOf] += amount;
        IERC20(asset).safeTransfer(onBehalfOf, amount);
    }

    function getUserAccountData(address user)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        )
    {
        return (deposits[user], borrows[user], deposits[user], 8000, 7500, deposits[user] > 0 ? 2e18 : 0);
    }
    
    function getAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 healthFactor) {
        return (deposits[user], borrows[user], deposits[user] > 0 ? 2e18 : 0);
    }
}

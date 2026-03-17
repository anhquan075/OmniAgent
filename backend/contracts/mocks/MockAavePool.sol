// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MockERC20} from "./MockERC20.sol";

contract MockAavePool {
    using SafeERC20 for IERC20;

    address public asset;
    address public aToken;

    constructor(address asset_, address aToken_) {
        asset = asset_;
        aToken = aToken_;
    }

    function supply(address asset_, uint256 amount, address onBehalfOf, uint16) external {
        require(asset_ == asset, "Wrong asset");
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        MockERC20(aToken).mint(onBehalfOf, amount);
    }

    function withdraw(address asset_, uint256 amount, address to) external returns (uint256) {
        require(asset_ == asset, "Wrong asset");
        MockERC20(aToken).burn(msg.sender, amount);
        IERC20(asset).safeTransfer(to, amount);
        return amount;
    }

    function getUserAccountData(address)
        external
        pure
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        )
    {
        return (1000e18, 0, 1000e18, 8000, 7500, 2e18);
    }
}

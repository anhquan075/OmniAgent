// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockVToken
 * @notice Mock idle token (e.g., aUSDT on Aave). Simulates mint/redeem with 1:1 exchange rate.
 */
contract MockVToken is ERC20 {
    IERC20 public immutable underlying;

    constructor(
        address underlying_,
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) {
        underlying = IERC20(underlying_);
    }

    function decimals() public view virtual override returns (uint8) {
        return 8;
    }

    function mint(uint256 mintAmount) external returns (uint256) {
        require(mintAmount > 0, "MockVToken: zero amount");
        underlying.transferFrom(msg.sender, address(this), mintAmount);
        _mint(msg.sender, mintAmount);
        return 0;
    }

    function redeemUnderlying(uint256 redeemAmount) external returns (uint256) {
        require(redeemAmount > 0, "MockVToken: zero amount");
        require(balanceOf(msg.sender) >= redeemAmount, "MockVToken: insufficient balance");
        _burn(msg.sender, redeemAmount);
        underlying.transfer(msg.sender, redeemAmount);
        return 0;
    }

    function getCash() external view returns (uint256) {
        return underlying.balanceOf(address(this));
    }
}

/**
 * @title MockNativeToken
 * @notice Mock wrapper for native ETH (Sepolia testnet). Accepts native ETH via mint().
 */
contract MockNativeToken is ERC20 {
    constructor() ERC20("Native ETH", "WETH") {}

    function decimals() public view virtual override returns (uint8) {
        return 8;
    }

    function mint() external payable {
        require(msg.value > 0, "MockNativeToken: zero ETH");
        _mint(msg.sender, msg.value);
    }

    function redeemUnderlying(uint256 redeemAmount) external returns (uint256) {
        require(redeemAmount > 0, "MockNativeToken: zero amount");
        require(balanceOf(msg.sender) >= redeemAmount, "MockNativeToken: insufficient balance");
        _burn(msg.sender, redeemAmount);
        payable(msg.sender).transfer(redeemAmount);
        return 0;
    }
}

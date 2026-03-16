// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";

contract MockPriceOracle is IPriceOracle, Ownable {
    uint256 private _price;
    bool public locked;

    constructor(uint256 initialPrice, address initialOwner) Ownable(initialOwner) {
        require(initialPrice > 0, "initial price is zero");
        _price = initialPrice;
    }

    function setPrice(uint256 price_) external onlyOwner {
        require(price_ > 0, "price is zero");
        require(!locked, "oracle locked");
        _price = price_;
    }

    function lock() external onlyOwner {
        require(!locked, "oracle locked");
        locked = true;
        renounceOwnership();
    }

    function getPrice() external view returns (uint256) {
        return _price;
    }
}

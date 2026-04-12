// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestUSDT is ERC20, Ownable {
    uint8 private immutable _decimals;

    constructor(address initialOwner) ERC20("Test USDT", "tUSDT") Ownable(initialOwner) {
        _decimals = 6;
        _mint(initialOwner, 1_000_000 * 10 ** 6);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

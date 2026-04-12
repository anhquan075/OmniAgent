// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract SimpleKycSBT is Ownable {
    mapping(address => uint8) public levels;

    event LevelSet(address indexed account, uint8 level);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setLevel(address account, uint8 level) external onlyOwner {
        levels[account] = level;
        emit LevelSet(account, level);
    }

    function isHuman(address account) external view returns (bool isValid, uint8 level) {
        level = levels[account];
        isValid = level > 0;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract MockKycSBT {
    mapping(address => bool) public isVerified;
    mapping(address => uint8) public kycLevel;

    function setKyc(address account, bool verified, uint8 level) external {
        isVerified[account] = verified;
        kycLevel[account] = level;
    }

    function isHuman(address account) external view returns (bool isValid, uint8 level) {
        return (isVerified[account], kycLevel[account]);
    }

    function getKycInfo(address account) external view returns (string memory, uint8, uint8, uint256) {
        return ("", kycLevel[account], isVerified[account] ? 1 : 0, 0);
    }
}

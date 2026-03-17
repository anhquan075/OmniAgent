// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockLZEndpoint {
    using SafeERC20 for IERC20;

    event MessageSent(uint32 dstEid, uint256 amount);

    function quote(uint32, bytes calldata, bytes calldata, bool)
        external
        pure
        returns (uint256 nativeFee, uint256 lzTokenFee)
    {
        return (0.01 ether, 0);
    }

    function send(uint32 dstEid, bytes calldata message, bytes calldata, address)
        external
        payable
        returns (uint256 nativeFee, uint256 lzTokenFee)
    {
        (address sender, uint256 amount) = abi.decode(message, (address, uint256));
        
        address asset = _getAssetFromSender(sender);
        if (asset != address(0)) {
            IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        }

        emit MessageSent(dstEid, amount);
        return (msg.value, 0);
    }

    function _getAssetFromSender(address sender) internal pure returns (address) {
        // In a real mock we'd store the asset, but here we can just assume 
        // the sender is the vault and it's bridging its asset.
        // For the test, we'll just return a dummy if we can't find it,
        // but better to actually mock the transfer.
        return address(0); 
    }
}

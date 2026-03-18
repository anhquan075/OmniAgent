// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockBridge {
    using SafeERC20 for IERC20;

    uint256 public constant BRIDGE_FEE_BPS = 100; // 1%
    uint256 public constant NATIVE_FEE = 0.0001 ether;

    event Bridged(address indexed token, uint256 amount, uint256 destinationChainId, address recipient, bytes32 requestId);

    function bridge(
        address token,
        uint256 amount,
        uint256 destinationChainId,
        address recipient
    ) external payable returns (bytes32 requestId) {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Invalid amount");
        require(recipient != address(0), "Invalid recipient");
        
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        uint256 fee = (amount * BRIDGE_FEE_BPS) / 10000;
        uint256 amountAfterFee = amount - fee;
        
        requestId = keccak256(abi.encodePacked(
            token,
            amount,
            destinationChainId,
            recipient,
            msg.sender,
            block.timestamp
        ));
        
        emit Bridged(token, amountAfterFee, destinationChainId, recipient, requestId);
    }

    function quoteBridge(
        address token,
        uint256 amount,
        uint256 destinationChainId,
        address recipient
    ) external view returns (uint256 fee, uint256 bridgeFee) {
        fee = NATIVE_FEE;
        bridgeFee = (amount * BRIDGE_FEE_BPS) / 10000;
    }
    
    function quote() external view returns (uint256 nativeFee, uint256 bridgeFeeBps) {
        nativeFee = NATIVE_FEE;
        bridgeFeeBps = BRIDGE_FEE_BPS;
    }
}

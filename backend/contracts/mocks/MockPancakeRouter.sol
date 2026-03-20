// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title MockSwapRouter
/// @notice Test double for AMM Router with configurable swap reserves
contract MockPancakeRouter {
    // tokenIn => tokenOut => reserve mapping
    mapping(address => mapping(address => uint256)) public reserves;
    
    /// @notice Set mock reserves for a token pair
    /// @param tokenIn Input token address
    /// @param tokenOut Output token address
    /// @param reserveIn Reserve amount for input token
    /// @param reserveOut Reserve amount for output token
    function setReserves(
        address tokenIn,
        address tokenOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) external {
        reserves[tokenIn][tokenOut] = reserveOut;
        reserves[tokenOut][tokenIn] = reserveIn;
    }
    
    /// @notice Swap exact tokens for tokens
    /// @dev Simplified constant-product AMM formula: amountOut = amountIn * reserveOut / reserveIn
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 /* deadline */
    ) external returns (uint256[] memory amounts) {
        require(path.length >= 2, "Invalid path");
        
        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];
        
        uint256 reserveOut = reserves[tokenIn][tokenOut];
        uint256 reserveIn = reserves[tokenOut][tokenIn];
        
        require(reserveOut > 0 && reserveIn > 0, "No reserves");
        
        // Constant product formula with 0.25% fee (997/1000)
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        uint256 amountOut = numerator / denominator;
        
        require(amountOut >= amountOutMin, "Insufficient output amount");
        
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).transfer(to, amountOut);
        
        // Update reserves
        reserves[tokenIn][tokenOut] = reserveOut - amountOut;
        reserves[tokenOut][tokenIn] = reserveIn + amountIn;
        
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOut;
    }
    
    /// @notice Get amounts out for a given input amount
    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts) {
        require(path.length >= 2, "Invalid path");
        
        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];
        
        uint256 reserveOut = reserves[tokenIn][tokenOut];
        uint256 reserveIn = reserves[tokenOut][tokenIn];
        
        if (reserveOut == 0 || reserveIn == 0) {
            amounts = new uint256[](2);
            amounts[0] = amountIn;
            amounts[1] = 0;
            return amounts;
        }
        
        // Constant product formula with 0.25% fee (997/1000)
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        uint256 amountOut = numerator / denominator;
        
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOut;
    }
}

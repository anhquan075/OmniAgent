// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPancakeRouter — PancakeSwap V2/V3 Router interface for token swaps
/// @notice Minimal interface for swapping USDT → WDKS and CAKE → USDT
interface IPancakeRouter {
    /// @notice Swap exact tokens for tokens with deadline protection
    /// @param amountIn Exact amount of input tokens
    /// @param amountOutMin Minimum amount of output tokens (slippage protection)
    /// @param path Array of token addresses [tokenIn, tokenOut] or multi-hop path
    /// @param to Recipient address
    /// @param deadline Unix timestamp deadline for trade execution
    /// @return amounts Array of amounts for each step in the path
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    /// @notice Get expected output amounts for a given input amount along a path
    /// @param amountIn Input amount
    /// @param path Token swap path
    /// @return amounts Expected output amounts
    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}

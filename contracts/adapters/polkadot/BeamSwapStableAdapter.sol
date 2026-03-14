// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IStableSwapPool} from "../../interfaces/IStableSwapPool.sol";

/// @title BeamSwapStableAdapter
/// @notice BeamSwap StableSwap pool adapter for USDC↔USDF swaps on Polkadot Hub
/// @dev BeamSwap uses Curve-style StableSwap pools (same interface as PancakeSwap StableSwap).
///      This adapter provides slippage-protected swaps between stablecoin pairs.
///      
///      BeamSwap StableSwap Pool (USDC/USDF): 0xE3f59aB3c37c33b6368CDF4f8AC79644011E402C (example)
///      
///      Coin Indices (verify on-chain):
///      - Coin 0: USDF
///      - Coin 1: USDC
///
/// @custom:security-contact security@asterpilot.xyz
contract BeamSwapStableAdapter is Ownable2Step {
    using SafeERC20 for IERC20;

    // ── errors ──
    error BeamSwapStableAdapter__ZeroAddress();
    error BeamSwapStableAdapter__ZeroAmount();
    error BeamSwapStableAdapter__SlippageTooHigh();
    error BeamSwapStableAdapter__ConfigurationLocked();

    // ── constants ──
    uint256 private constant BPS_DENOMINATOR = 10_000;

    // ── immutables ──
    IStableSwapPool public immutable pool;
    IERC20 public immutable tokenIn;
    IERC20 public immutable tokenOut;

    // ── storage ──
    uint256 public swapSlippageBps; // Max slippage in basis points (e.g., 100 = 1%)
    bool public configurationLocked;

    // ── events ──
    event SwapExecuted(uint256 amountIn, uint256 amountOut, int128 i, int128 j);
    event SlippageUpdated(uint256 slippageBps);
    event ConfigurationLocked();

    /// @notice Initialize BeamSwap StableSwap adapter for slippage-protected stablecoin swaps
    /// @dev Sets up infinite approval for tokenIn to the BeamSwap pool. Default slippage is 1% (100 bps).
    ///      BeamSwap uses Curve-style StableSwap pools with coin indices for swap routing.
    /// @param poolAddress BeamSwap StableSwap pool address (e.g., USDC/USDF pool)
    /// @param tokenInAddress Token to swap from (typically USDC)
    /// @param tokenOutAddress Token to swap to (typically USDF)
    /// @param initialOwner Initial owner address (typically ProofVault deployer)
    constructor(
        address poolAddress,
        address tokenInAddress,
        address tokenOutAddress,
        address initialOwner
    ) Ownable(initialOwner) {
        if (poolAddress == address(0)) revert BeamSwapStableAdapter__ZeroAddress();
        if (tokenInAddress == address(0)) revert BeamSwapStableAdapter__ZeroAddress();
        if (tokenOutAddress == address(0)) revert BeamSwapStableAdapter__ZeroAddress();

        pool = IStableSwapPool(poolAddress);
        tokenIn = IERC20(tokenInAddress);
        tokenOut = IERC20(tokenOutAddress);

        // Default: 1% max slippage
        swapSlippageBps = 100;

        // Approve pool for token swaps
        tokenIn.forceApprove(poolAddress, type(uint256).max);
    }

    // ── configuration (owner-only) ──

    /// @notice Set maximum allowed slippage for swaps
    /// @dev Can only be called before configuration is locked. Slippage is capped at 10% (1000 bps)
    ///      to prevent accidentally setting overly permissive slippage that could result in value loss.
    /// @param slippageBps_ Maximum slippage in basis points (e.g., 100 = 1%, 50 = 0.5%)
    function setSwapSlippage(uint256 slippageBps_) external onlyOwner {
        if (configurationLocked) revert BeamSwapStableAdapter__ConfigurationLocked();
        if (slippageBps_ > 1000) revert BeamSwapStableAdapter__SlippageTooHigh(); // Max 10%
        swapSlippageBps = slippageBps_;
        emit SlippageUpdated(slippageBps_);
    }

    /// @notice Finalize configuration and renounce ownership, making slippage settings immutable
    /// @dev After calling this function:
    ///      1. Slippage settings become immutable
    ///      2. Owner permissions are permanently renounced
    ///      This ensures the adapter operates with fixed risk parameters after deployment.
    function lockConfiguration() external onlyOwner {
        configurationLocked = true;
        emit ConfigurationLocked();
        renounceOwnership();
    }

    // ── swap function ──

    /// @notice Swap tokenIn → tokenOut via BeamSwap StableSwap pool with slippage protection
    /// @dev Executes the swap flow:
    ///      1. Transfer tokenIn from caller to this adapter
    ///      2. Calculate minOut = amountIn * (1 - slippageBps/10000) for slippage protection
    ///      3. Call pool.exchange(i, j, amountIn, minOut) to execute swap
    ///      4. Transfer received tokenOut back to caller
    ///      
    ///      BeamSwap uses Curve-style StableSwap with coin indices:
    ///      - i: Index of input token in pool (verify on-chain, typically USDC = 1)
    ///      - j: Index of output token in pool (verify on-chain, typically USDF = 0)
    ///      
    ///      Slippage protection ensures swap reverts if output is below minOut threshold.
    /// @param amountIn Amount of tokenIn to swap (must be > 0)
    /// @param i Index of tokenIn in the pool (e.g., 1 for USDC)
    /// @param j Index of tokenOut in the pool (e.g., 0 for USDF)
    /// @return amountOut Actual amount of tokenOut received and transferred to caller
    function swap(
        uint256 amountIn,
        int128 i,
        int128 j
    ) external returns (uint256 amountOut) {
        if (amountIn == 0) revert BeamSwapStableAdapter__ZeroAmount();

        // Transfer tokenIn from caller
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);

        // Calculate minimum output with slippage protection
        // For stablecoins, we expect near 1:1 exchange
        uint256 minOut = (amountIn * (BPS_DENOMINATOR - swapSlippageBps)) / BPS_DENOMINATOR;

        // Execute swap on BeamSwap pool
        uint256 balanceBefore = tokenOut.balanceOf(address(this));
        pool.exchange(i, j, amountIn, minOut);
        uint256 balanceAfter = tokenOut.balanceOf(address(this));

        // Calculate actual amount received
        amountOut = balanceAfter - balanceBefore;

        // Transfer tokenOut to caller
        tokenOut.safeTransfer(msg.sender, amountOut);

        emit SwapExecuted(amountIn, amountOut, i, j);
    }

    /// @notice Preview expected output amount for a swap without executing it
    /// @dev Calls pool.get_dy() to calculate expected output based on current pool state.
    ///      This is a view function that does not modify state or execute any swaps.
    ///      Useful for UI preview and off-chain calculations.
    /// @param i Index of tokenIn in the pool
    /// @param j Index of tokenOut in the pool
    /// @param dx Amount of tokenIn to swap
    /// @return Expected amount of tokenOut (actual swap may vary slightly due to slippage)
    function getSwapOutput(
        int128 i,
        int128 j,
        uint256 dx
    ) external view returns (uint256) {
        return pool.get_dy(i, j, dx);
    }

    /// @notice Get the current virtual price of the pool's LP token
    /// @dev Virtual price represents the value of 1 LP token in the underlying asset,
    ///      scaled by 1e18. A healthy StableSwap pool should maintain a virtual price close
    ///      to 1e18 (= $1.00). Significant deviations may indicate pool imbalance or exploit.
    /// @return Virtual price scaled by 1e18 (e.g., 1005000000000000000 = $1.005)
    function getVirtualPrice() external view returns (uint256) {
        return pool.get_virtual_price();
    }
}

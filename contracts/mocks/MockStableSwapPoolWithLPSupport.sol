// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IStableSwapPool} from "../interfaces/IStableSwapPool.sol";

/// @title MockStableSwapPoolWithLPSupport
/// @notice Test double for PCS StableSwap that supports add/remove liquidity and LP token minting.
/// @dev Coin index 0 = USDF, 1 = USDT. Mints an internal LP token on add_liquidity.
contract MockStableSwapPoolWithLPSupport is IStableSwapPool, ERC20 {
    IERC20 public token0; // USDF (index 0)
    IERC20 public token1; // USDT (index 1)

    uint256[2] public poolBalances;
    uint256 public virtualPrice;
    uint256 public feeBps;

    constructor(
        address _token0,
        address _token1,
        uint256 _bal0,
        uint256 _bal1,
        uint256 _virtualPrice,
        uint256 _feeBps
    ) ERC20("Mock StableSwap LP", "mSSLP") {
        token0 = IERC20(_token0);
        token1 = IERC20(_token1);
        poolBalances[0] = _bal0;
        poolBalances[1] = _bal1;
        virtualPrice = _virtualPrice;
        feeBps = _feeBps;

        // Allow this contract to transfer tokens from itself (needed for exchange)
        token0.approve(address(this), type(uint256).max);
        token1.approve(address(this), type(uint256).max);
    }

    // ── IStableSwapPool ──────────────────────────────────────────────────────

    function get_balances() external view returns (uint256[2] memory) {
        return poolBalances;
    }

    function get_dy(int128 i, int128 j, uint256 dx) external view returns (uint256 dy) {
        uint256 idxIn  = uint256(uint128(i));
        uint256 idxOut = uint256(uint128(j));
        dy = dx * (10_000 - feeBps) / 10_000;
        if (poolBalances[idxOut] > 0 && poolBalances[idxIn] > 0) {
            dy = dx * poolBalances[idxOut] / poolBalances[idxIn];
            dy = dy * (10_000 - feeBps) / 10_000;
        }
    }

    function get_virtual_price() external view returns (uint256) {
        return virtualPrice;
    }

    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256 dy) {
        IERC20 tokenIn  = i == 0 ? token0 : token1;
        IERC20 tokenOut = i == 0 ? token1 : token0;
        tokenIn.transferFrom(msg.sender, address(this), dx);
        uint256 idxIn  = uint256(uint128(i));
        uint256 idxOut = uint256(uint128(j));
        dy = dx * (10_000 - feeBps) / 10_000;
        if (poolBalances[idxOut] > 0 && poolBalances[idxIn] > 0) {
            dy = dx * poolBalances[idxOut] / poolBalances[idxIn];
            dy = dy * (10_000 - feeBps) / 10_000;
        }
        require(dy >= min_dy, "slippage");
        tokenOut.transfer(msg.sender, dy);
        poolBalances[idxIn]  += dx;
        poolBalances[idxOut] -= dy;
    }

    /// @notice Accepts USDT (index 1) or USDF (index 0), mints LP tokens 1:1 with deposited value.
    function add_liquidity(uint256[2] calldata amounts, uint256 min_mint_amount) external returns (uint256 lpMinted) {
        if (amounts[0] > 0) token0.transferFrom(msg.sender, address(this), amounts[0]);
        if (amounts[1] > 0) token1.transferFrom(msg.sender, address(this), amounts[1]);
        // LP minted = total value deposited / virtualPrice (1e18 base)
        uint256 totalValue = amounts[0] + amounts[1];
        lpMinted = (totalValue * 1e18) / virtualPrice;
        require(lpMinted >= min_mint_amount, "min lp not met");
        poolBalances[0] += amounts[0];
        poolBalances[1] += amounts[1];
        _mint(msg.sender, lpMinted);
    }

    /// @notice Burns LP tokens and returns single-coin output (i = coin index).
    function remove_liquidity_one_coin(uint256 token_amount, int128 i, uint256 min_amount) external returns (uint256 amountOut) {
        // Value of LP = token_amount * virtualPrice / 1e18
        uint256 value = (token_amount * virtualPrice) / 1e18;
        amountOut = value * (10_000 - feeBps) / 10_000;
        require(amountOut >= min_amount, "min amount not met");
        _burn(msg.sender, token_amount);
        IERC20 tokenOut = i == 0 ? token0 : token1;
        uint256 idxOut = uint256(uint128(i));
        poolBalances[idxOut] -= amountOut;
        tokenOut.transfer(msg.sender, amountOut);
    }

    // ── Test helpers ─────────────────────────────────────────────────────────

    function setVirtualPrice(uint256 vp) external {
        virtualPrice = vp;
    }

    function setBalances(uint256 b0, uint256 b1) external {
        poolBalances[0] = b0;
        poolBalances[1] = b1;
    }
    
    /// @notice Direct mint for testing (bypasses add_liquidity)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

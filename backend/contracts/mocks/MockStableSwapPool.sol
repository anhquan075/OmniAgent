// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IStableSwapPool} from "../interfaces/IStableSwapPool.sol";

/// @title MockStableSwapPool — test double for StableSwap
contract MockStableSwapPool is IStableSwapPool, ERC20 {
    uint256[2] public balances;
    uint256 public virtualPrice;
    uint256 public feeBps; // e.g. 4 = 0.04%

    IERC20 public token0; // USDT
    IERC20 public token1; // WDKS

    constructor(
        address _token0,
        address _token1,
        uint256 _bal0,
        uint256 _bal1,
        uint256 _virtualPrice,
        uint256 _feeBps
    ) ERC20("BeamSwap USDC-WDKS LP", "bsLP-USDC-WDKS") {
        token0 = IERC20(_token0);
        token1 = IERC20(_token1);
        balances[0] = _bal0;
        balances[1] = _bal1;
        virtualPrice = _virtualPrice;
        feeBps = _feeBps;
    }

    function get_balances() external view returns (uint256[2] memory) {
        return balances;
    }

    function get_dy(int128 i, int128 j, uint256 dx) external view returns (uint256 dy) {
        // simple constant-product with fee
        dy = dx * (10_000 - feeBps) / 10_000;
        // apply pool imbalance: if selling token that pool has less of, get more
        uint256 idxIn  = uint256(uint128(i));
        uint256 idxOut = uint256(uint128(j));
        if (balances[idxOut] > 0 && balances[idxIn] > 0) {
            dy = dx * balances[idxOut] / balances[idxIn];
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

        // simple constant-product with fee
        dy = dx * (10_000 - feeBps) / 10_000;
        // apply pool imbalance: if selling token that pool has less of, get more
        uint256 idxIn  = uint256(uint128(i));
        uint256 idxOut = uint256(uint128(j));
        if (balances[idxOut] > 0 && balances[idxIn] > 0) {
            dy = dx * balances[idxOut] / balances[idxIn];
            dy = dy * (10_000 - feeBps) / 10_000;
        }

        require(dy >= min_dy, "slippage");
        tokenOut.transfer(msg.sender, dy);

        balances[idxIn]  += dx;
        balances[idxOut] -= dy;
    }

    /// @notice Stub — not used by existing tests; satisfies IStableSwapPool.
    /// @notice Add liquidity and mint LP tokens
    function add_liquidity(uint256[2] calldata amounts, uint256 min_mint_amount) external returns (uint256 lpMinted) {
        // Transfer tokens from sender to pool
        if (amounts[0] > 0) {
            token0.transferFrom(msg.sender, address(this), amounts[0]);
            balances[0] += amounts[0];
        }
        if (amounts[1] > 0) {
            token1.transferFrom(msg.sender, address(this), amounts[1]);
            balances[1] += amounts[1];
        }

        // Simple LP minting: sum of amounts (normalized to 1:1 value)
        // Scale from USDC (6 decimals) to LP (18 decimals)
        lpMinted = (amounts[0] + amounts[1]) * 1e12;
        require(lpMinted >= min_mint_amount, "slippage");

        // Mint LP tokens to sender
        _mint(msg.sender, lpMinted);
    }

    /// @notice Remove liquidity and burn LP tokens
    function remove_liquidity_one_coin(uint256 token_amount, int128 i, uint256 min_amount) external returns (uint256 dy) {
        // Burn LP tokens from sender
        _burn(msg.sender, token_amount);

        // Determine output token
        IERC20 tokenOut = i == 0 ? token0 : token1;
        uint256 idxOut = uint256(uint128(i));

        // Simple 1:1 withdrawal (minus small fee)
        // Scale from LP (18 decimals) to USDC (6 decimals)
        dy = (token_amount / 1e12) * (10_000 - feeBps) / 10_000;
        require(dy >= min_amount, "slippage");
        require(balances[idxOut] >= dy, "insufficient pool balance");

        // Transfer token to sender
        tokenOut.transfer(msg.sender, dy);
        balances[idxOut] -= dy;
    }

    // ── test helpers ──
    function setBalances(uint256 b0, uint256 b1) external {
        balances[0] = b0;
        balances[1] = b1;
    }

    function setVirtualPrice(uint256 vp) external {
        virtualPrice = vp;
    }
}

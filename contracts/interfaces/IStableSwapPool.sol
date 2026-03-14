// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IStableSwapPool — read/swap/LP interface for PCS StableSwap (Vyper)
interface IStableSwapPool {
    function get_balances() external view returns (uint256[2] memory);
    function get_virtual_price() external view returns (uint256);
    function get_dy(int128 i, int128 j, uint256 dx) external view returns (uint256);
    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256);

    // LP liquidity methods
    function add_liquidity(uint256[2] calldata amounts, uint256 min_mint_amount) external returns (uint256);
    function remove_liquidity_one_coin(uint256 token_amount, int128 i, uint256 min_amount) external returns (uint256);
}

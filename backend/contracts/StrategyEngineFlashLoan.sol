// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IUniswapV3Pool {
    function flash(
        address recipient,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external;
}

interface IUniswapV3FlashCallback {
    function uniswapV3FlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external;
}

interface IManagedAdapter {
    function onVaultDeposit(uint256 amount) external;
    function withdrawToVault(uint256 amount) external returns (uint256);
}

/// @title StrategyEngineFlashLoan
/// @notice Legacy standalone flash-loan helper. Superseded by StrategyEngine's integrated
///         flash-rebalance flow (executeCycleWithFlash + OmniAgentVault.executeFlashRebalanceStep).
///         Kept for reference and testnet backwards-compatibility only.
contract StrategyEngineFlashLoan is IUniswapV3FlashCallback, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    address public immutable asset; // USDT
    address public immutable uniswapV3Pool; // USDT/WETH or similar high-liquidity pool
    
    // Config
    bool public isToken0; // Is USDT token0 or token1 in the pool?

    error StrategyEngineFlashLoan__Unauthorized();
    error StrategyEngineFlashLoan__ZeroAddress();
    error StrategyEngineFlashLoan__InsufficientWithdrawal();

    event AtomicRebalance(address indexed fromAdapter, address indexed toAdapter, uint256 amount);

    constructor(address _asset, address _uniswapV3Pool, bool _isToken0) Ownable(msg.sender) {
        if (_asset == address(0) || _uniswapV3Pool == address(0)) revert StrategyEngineFlashLoan__ZeroAddress();
        asset = _asset;
        uniswapV3Pool = _uniswapV3Pool;
        isToken0 = _isToken0;
    }

    struct FlashData {
        address fromAdapter;
        address toAdapter;
        uint256 amount;
    }

    /// @notice Initiates a flash loan to shift capital atomically between adapters
    /// @dev Borrows USDT, deposits to new adapter, withdraws from old adapter, repays loan
    function executeAtomicRebalance(
        address fromAdapter,
        address toAdapter,
        uint256 amount
    ) external onlyOwner nonReentrant {
        bytes memory data = abi.encode(
            FlashData({
                fromAdapter: fromAdapter,
                toAdapter: toAdapter,
                amount: amount
            })
        );

        uint256 amount0 = isToken0 ? amount : 0;
        uint256 amount1 = isToken0 ? 0 : amount;

        // Triggers the flash loan, which calls uniswapV3FlashCallback
        IUniswapV3Pool(uniswapV3Pool).flash(address(this), amount0, amount1, data);

        emit AtomicRebalance(fromAdapter, toAdapter, amount);
    }

    /// @notice Callback executed by the Uniswap V3 pool during the flash loan
    function uniswapV3FlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external override {
        if (msg.sender != uniswapV3Pool) revert StrategyEngineFlashLoan__Unauthorized();

        FlashData memory flashData = abi.decode(data, (FlashData));
        uint256 fee = isToken0 ? fee0 : fee1;

        // 1. We now hold `amount` of borrowed USDT.
        // Deposit into the target adapter.
        IERC20(asset).safeTransfer(flashData.toAdapter, flashData.amount);
        IManagedAdapter(flashData.toAdapter).onVaultDeposit(flashData.amount);

        // 2. Withdraw from the source adapter to cover the loan + fee.
        // Note: The vault/source adapter must have enough liquidity to cover `amount + fee`.
        uint256 totalRepayment = flashData.amount + fee;
        uint256 withdrawn = IManagedAdapter(flashData.fromAdapter).withdrawToVault(totalRepayment);
        
        if (withdrawn < totalRepayment) revert StrategyEngineFlashLoan__InsufficientWithdrawal();

        // 3. Repay the flash loan
        IERC20(asset).safeTransfer(uniswapV3Pool, totalRepayment);
    }
}

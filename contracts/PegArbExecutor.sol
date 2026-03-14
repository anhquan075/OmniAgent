// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPegArbExecutor} from "./interfaces/IPegArbExecutor.sol";
import {IStableSwapPool} from "./interfaces/IStableSwapPool.sol";
import {IWDKSMinting} from "./interfaces/IWDKSMinting.sol";

/// @title PegArbExecutor — permissionless atomic WDKS/USDT arb
/// @notice Detects peg deviation, executes arb, pays bounty, returns profit to vault.
/// @custom:security-contact security@wdkpilot.xyz
contract PegArbExecutor is IPegArbExecutor, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── errors ──
    error PegArbExecutor__ZeroAddress();
    error PegArbExecutor__BadMinProfit();
    error PegArbExecutor__BadMaxArb();
    error PegArbExecutor__BadBounty();
    error PegArbExecutor__BadDeviation();
    error PegArbExecutor__EmptyPool();
    error PegArbExecutor__NoArbOpportunity();
    error PegArbExecutor__ZeroTrade();
    error PegArbExecutor__NoProfit();
    error PegArbExecutor__BelowMinProfit();

    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ── immutables ──
    address public immutable vault;
    IERC20  public immutable usdt;
    IERC20  public immutable wdks;
    IWDKSMinting    public immutable wdksMinting;
    IStableSwapPool public immutable stableSwapPool;
    uint256 public immutable minProfitBps;
    uint256 public immutable maxArbBps;
    uint256 public immutable arbBountyBps;
    uint256 public immutable deviationThresholdBps;

    constructor(
        address _vault,
        address _usdt,
        address _wdks,
        address _wdksMinting,
        address _stableSwapPool,
        uint256 _minProfitBps,
        uint256 _maxArbBps,
        uint256 _arbBountyBps,
        uint256 _deviationThresholdBps
    ) {
        if (_vault == address(0) || _usdt == address(0) || _wdks == address(0)
            || _wdksMinting == address(0) || _stableSwapPool == address(0))
        {
            revert PegArbExecutor__ZeroAddress();
        }
        if (_minProfitBps == 0 || _minProfitBps > BPS_DENOMINATOR) revert PegArbExecutor__BadMinProfit();
        if (_maxArbBps == 0 || _maxArbBps > BPS_DENOMINATOR) revert PegArbExecutor__BadMaxArb();
        if (_arbBountyBps > BPS_DENOMINATOR) revert PegArbExecutor__BadBounty();
        if (_deviationThresholdBps == 0 || _deviationThresholdBps > BPS_DENOMINATOR) revert PegArbExecutor__BadDeviation();

        vault                 = _vault;
        usdt                  = IERC20(_usdt);
        wdks                  = IERC20(_wdks);
        wdksMinting           = IWDKSMinting(_wdksMinting);
        stableSwapPool        = IStableSwapPool(_stableSwapPool);
        minProfitBps          = _minProfitBps;
        maxArbBps             = _maxArbBps;
        arbBountyBps          = _arbBountyBps;
        deviationThresholdBps = _deviationThresholdBps;
    }

    /*//////////////////////////////////////////////////////////////
                                 VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IPegArbExecutor
    function previewArb() external view returns (ArbPreview memory preview) {
        (uint256 poolPrice, ArbDirection dir) = _detectDirection();
        preview.poolPrice = poolPrice;
        preview.direction = dir;

        if (dir == ArbDirection.None) return preview;

        uint256 vaultBal  = usdt.balanceOf(vault);
        preview.tradeSize = vaultBal * maxArbBps / BPS_DENOMINATOR;

        uint256 deviation = poolPrice > 1e18 ? poolPrice - 1e18 : 1e18 - poolPrice;
        uint256 feeBps    = 8; // rough pool fee estimate
        uint256 devBps    = deviation * BPS_DENOMINATOR / 1e18;
        preview.estimatedProfitBps = devBps > feeBps ? devBps - feeBps : 0;
    }

    /*//////////////////////////////////////////////////////////////
                              STATE-CHANGING
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IPegArbExecutor
    function executeArb() external nonReentrant returns (uint256 profit) {
        (uint256 poolPrice, ArbDirection dir) = _detectDirection();
        if (dir == ArbDirection.None) revert PegArbExecutor__NoArbOpportunity();

        uint256 vaultBal  = usdt.balanceOf(vault);
        uint256 tradeSize = vaultBal * maxArbBps / BPS_DENOMINATOR;
        if (tradeSize == 0) revert PegArbExecutor__ZeroTrade();

        // Pull USDT from vault (vault must have approved this contract)
        usdt.safeTransferFrom(vault, address(this), tradeSize);

        uint256 usdtBefore = usdt.balanceOf(address(this));

        if (dir == ArbDirection.BuyWDKS) {
            _executeBuyWDKS(tradeSize, poolPrice);
        } else {
            _executeSellWDKS(tradeSize, poolPrice);
        }

        uint256 usdtAfter = usdt.balanceOf(address(this));
        if (usdtAfter <= usdtBefore) revert PegArbExecutor__NoProfit();
        profit = usdtAfter - usdtBefore;

        if (profit * BPS_DENOMINATOR / tradeSize < minProfitBps) revert PegArbExecutor__BelowMinProfit();

        // Pay bounty to caller
        uint256 bounty = profit * arbBountyBps / BPS_DENOMINATOR;
        if (bounty > 0) {
            usdt.safeTransfer(msg.sender, bounty);
        }

        // Return remaining to vault
        uint256 remaining = usdt.balanceOf(address(this));
        if (remaining > 0) {
            usdt.safeTransfer(vault, remaining);
        }

        emit ArbExecuted(dir, tradeSize, profit, bounty, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                              INTERNAL LOGIC
    //////////////////////////////////////////////////////////////*/

    function _detectDirection()
        internal
        view
        returns (uint256 poolPrice, ArbDirection dir)
    {
        (bool ok, uint256 bal0, uint256 bal1) = _readPoolBalances();
        if (!ok || bal1 == 0) revert PegArbExecutor__EmptyPool();
        poolPrice = bal0 * 1e18 / bal1; // USDT per WDKS

        uint256 threshold = 1e18 * deviationThresholdBps / BPS_DENOMINATOR;

        if (poolPrice < 1e18 - threshold) {
            dir = ArbDirection.BuyWDKS;  // WDKS cheap → buy on pool, redeem at par
        } else if (poolPrice > 1e18 + threshold) {
            dir = ArbDirection.SellWDKS; // WDKS expensive → mint at par, sell on pool
        } else {
            dir = ArbDirection.None;
        }
    }

    function _readPoolBalances()
        internal
        view
        returns (bool ok, uint256 bal0, uint256 bal1)
    {
        address poolAddr = address(stableSwapPool);

        (bool sGet, bytes memory dGet) = poolAddr.staticcall(
            abi.encodeWithSignature("get_balances()")
        );
        if (sGet && dGet.length >= 64) {
            uint256[2] memory b = abi.decode(dGet, (uint256[2]));
            return (true, b[0], b[1]);
        }

        (bool s0, bytes memory d0) = poolAddr.staticcall(
            abi.encodeWithSignature("balances(uint256)", 0)
        );
        (bool s1, bytes memory d1) = poolAddr.staticcall(
            abi.encodeWithSignature("balances(uint256)", 1)
        );
        if (s0 && s1 && d0.length >= 32 && d1.length >= 32) {
            return (true, abi.decode(d0, (uint256)), abi.decode(d1, (uint256)));
        }

        return (false, 0, 0);
    }

    /// @dev Path A: USDT → buy cheap WDKS on pool → redeem at par → USDT
    ///      min_dy is derived from current pool price with slippage tolerance
    function _executeBuyWDKS(uint256 usdtAmount, uint256 poolPrice) internal {
        // Expected WDKS out ≈ usdtAmount / poolPrice; apply 1% slippage tolerance
        uint256 expectedUsdf = usdtAmount * 1e18 / poolPrice;
        uint256 minUsdfOut   = expectedUsdf * 9900 / BPS_DENOMINATOR; // 1% slippage

        usdt.forceApprove(address(stableSwapPool), usdtAmount);
        stableSwapPool.exchange(0, 1, usdtAmount, minUsdfOut);
        usdt.forceApprove(address(stableSwapPool), 0);

        uint256 wdksBal = wdks.balanceOf(address(this));
        wdks.forceApprove(address(wdksMinting), wdksBal);
        wdksMinting.redeem(wdksBal);
        wdks.forceApprove(address(wdksMinting), 0);
    }

    /// @dev Path B: USDT → mint WDKS at par → sell expensive WDKS on pool → USDT
    ///      min_dy is derived from current pool price with slippage tolerance
    function _executeSellWDKS(uint256 usdtAmount, uint256 poolPrice) internal {
        usdt.forceApprove(address(wdksMinting), usdtAmount);
        wdksMinting.mint(usdtAmount);
        usdt.forceApprove(address(wdksMinting), 0);

        uint256 wdksBal = wdks.balanceOf(address(this));
        // Expected USDT out ≈ wdksBal * poolPrice / 1e18; apply 1% slippage tolerance
        uint256 expectedUsdt = wdksBal * poolPrice / 1e18;
        uint256 minUsdtOut   = expectedUsdt * 9900 / BPS_DENOMINATOR; // 1% slippage

        wdks.forceApprove(address(stableSwapPool), wdksBal);
        stableSwapPool.exchange(1, 0, wdksBal, minUsdtOut);
        wdks.forceApprove(address(stableSwapPool), 0);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IManagedAdapter} from "./interfaces/IManagedAdapter.sol";
import {IVenusVToken} from "./interfaces/IVenusVToken.sol";
import {TransientReentrancyGuard} from "./TransientReentrancyGuard.sol";

/**
 * @title OmniAgentVault
 * @notice OmniAgent OmniAgentVault V2 (Polkadot Hub Adaptation)
 */
contract OmniAgentVault is ERC4626, Ownable, TransientReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant PROFIT_UNLOCK_TIME = 6 hours;

    // --- Immutables ---
    uint256 public immutable idleBufferBps;

    // --- State ---
    address public engine;
    IManagedAdapter public wdkAdapter;
    IManagedAdapter public secondaryAdapter;
    IManagedAdapter public lpAdapter;
    IManagedAdapter public lendingAdapter;
    IVenusVToken public venusVToken;
    uint256 public venusExchangeRateScale;
    bool public configurationLocked;
    address public pegArbExecutor;
    
    uint256 public lockedProfit;
    uint256 public lastReport;
    
    mapping(address => uint256) public userPrincipal;

    // --- Events ---
    event Rebalanced(uint256 wdkTarget, uint256 actualWDK, uint256 idle, uint256 secondary, uint256 lp, uint256 lending);
    event BountyPaid(address indexed executor, uint256 amount);
    event AutoHarvestTriggered(uint256 harvested);
    event WDKWithdrawFailed(uint256 amount);
    event EngineSet(address indexed engine);
    event PegArbExecutorSet(address indexed pegArbExecutor);
    event VenusIdleBufferSet(address indexed venusVToken, uint256 exchangeRateScale);
    event AdaptersSet(address indexed wdk, address indexed secondary, address indexed lp, address lending);
    event ConfigurationLocked();
    event YieldWithdrawn(address indexed user, address indexed receiver, uint256 amount);

    // --- Errors ---
    error OmniAgentVault__ZeroAddress();
    error OmniAgentVault__BufferTooHigh();
    error OmniAgentVault__NotLocked();
    error OmniAgentVault__ConfigurationLocked();
    error OmniAgentVault__CallerNotEngine();
    error OmniAgentVault__EngineNotSet();
    error OmniAgentVault__WDKNotSet();
    error OmniAgentVault__SecondaryNotSet();
    error OmniAgentVault__LpNotSet();
    error OmniAgentVault__LendingNotSet();
    error OmniAgentVault__InvalidFlashAdapter();
    error OmniAgentVault__InsufficientLiquidity();
    error OmniAgentVault__PegArbNotApproved();
    error OmniAgentVault__VenusDecimalsInvalid();
    error OmniAgentVault__VenusMintFailed(uint256 code);
    error OmniAgentVault__VenusRedeemFailed(uint256 code);
    error OmniAgentVault__AdapterReportingFailure(address adapter);
    error OmniAgentVault__AssetMismatch(address adapter);

    modifier onlyEngine() {
        if (msg.sender != engine) revert OmniAgentVault__CallerNotEngine();
        _;
    }

    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        address initialOwner_,
        uint256 idleBufferBps_
    ) ERC20(name_, symbol_) ERC4626(asset_) Ownable(initialOwner_) {
        if (idleBufferBps_ > 2000) revert OmniAgentVault__BufferTooHigh();
        idleBufferBps = idleBufferBps_;
    }

    function setEngine(address engine_) external onlyOwner {
        if (engine_ == address(0)) revert OmniAgentVault__ZeroAddress();
        engine = engine_;
        emit EngineSet(engine_);
    }

    function setAdapters(
        IManagedAdapter wdk_,
        IManagedAdapter secondary_,
        IManagedAdapter lp_,
        IManagedAdapter lending_
    ) external onlyOwner {
        if (configurationLocked) revert OmniAgentVault__ConfigurationLocked();
        
        address targetAsset = asset();
        if (address(wdk_) != address(0) && wdk_.asset() != targetAsset) revert OmniAgentVault__AssetMismatch(address(wdk_));
        if (address(secondary_) != address(0) && secondary_.asset() != targetAsset) revert OmniAgentVault__AssetMismatch(address(secondary_));
        if (address(lp_) != address(0) && lp_.asset() != targetAsset) revert OmniAgentVault__AssetMismatch(address(lp_));
        if (address(lending_) != address(0) && lending_.asset() != targetAsset) revert OmniAgentVault__AssetMismatch(address(lending_));

        wdkAdapter = wdk_;
        secondaryAdapter = secondary_;
        lpAdapter = lp_;
        lendingAdapter = lending_;

        if (address(wdk_) != address(0)) IERC20(targetAsset).forceApprove(address(wdk_), type(uint256).max);
        if (address(secondary_) != address(0)) IERC20(targetAsset).forceApprove(address(secondary_), type(uint256).max);
        if (address(lp_) != address(0)) IERC20(targetAsset).forceApprove(address(lp_), type(uint256).max);
        if (address(lending_) != address(0)) IERC20(targetAsset).forceApprove(address(lending_), type(uint256).max);

        emit AdaptersSet(address(wdk_), address(secondary_), address(lp_), address(lending_));
    }

    function lockConfiguration() external onlyOwner {
        if (engine == address(0)) revert OmniAgentVault__EngineNotSet();
        if (address(wdkAdapter) == address(0)) revert OmniAgentVault__WDKNotSet();
        if (address(secondaryAdapter) == address(0)) revert OmniAgentVault__SecondaryNotSet();
        if (address(lendingAdapter) == address(0)) revert OmniAgentVault__LendingNotSet();
        configurationLocked = true;
        emit ConfigurationLocked();
        renounceOwnership();
    }

    function totalAssets() public view override returns (uint256) {
        (uint256 total, ) = _totalAssetsInternal();
        uint256 currentlyLocked = calculateLockedProfit();
        if (total < currentlyLocked) return 0;
        return total - currentlyLocked;
    }

    /**
     * @notice Returns the raw total assets without subtracting locked profit.
     */
    function rawTotalAssets() public view returns (uint256) {
        (uint256 total, ) = _totalAssetsInternal();
        return total;
    }

    function calculateLockedProfit() public view returns (uint256) {
        uint256 locked = lockedProfit;
        if (locked == 0) return 0;

        uint256 timeSinceReport = block.timestamp - lastReport;
        if (timeSinceReport >= PROFIT_UNLOCK_TIME) {
            return 0;
        }

        return locked - (locked * timeSinceReport / PROFIT_UNLOCK_TIME);
    }

    function _totalAssetsInternal() internal view returns (uint256 total, address failingAdapter) {
        uint256 wdkManaged;
        if (address(wdkAdapter) != address(0)) {
            try wdkAdapter.managedAssets() returns (uint256 v) { wdkManaged = v; } catch { failingAdapter = address(wdkAdapter); }
        }
        uint256 secManaged;
        if (address(secondaryAdapter) != address(0)) {
            try secondaryAdapter.managedAssets() returns (uint256 v) { secManaged = v; } catch { if (failingAdapter == address(0)) failingAdapter = address(secondaryAdapter); }
        }
        uint256 lpManaged;
        if (address(lpAdapter) != address(0)) {
            try lpAdapter.managedAssets() returns (uint256 v) { lpManaged = v; } catch { if (failingAdapter == address(0)) failingAdapter = address(lpAdapter); }
        }
        uint256 lendingManaged;
        if (address(lendingAdapter) != address(0)) {
            try lendingAdapter.managedAssets() returns (uint256 v) { lendingManaged = v; } catch { if (failingAdapter == address(0)) failingAdapter = address(lendingAdapter); }
        }
        total = _idleAssets() + wdkManaged + secManaged + lpManaged + lendingManaged;
    }

    function _idleAssets() internal view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + _venusUnderlyingBalance();
    }

    function _venusUnderlyingBalance() internal view returns (uint256) {
        if (address(venusVToken) == address(0) || venusExchangeRateScale == 0) return 0;
        uint256 vTokenBalance = venusVToken.balanceOf(address(this));
        if (vTokenBalance == 0) return 0;
        return (vTokenBalance * venusVToken.exchangeRateStored()) / venusExchangeRateScale;
    }

    function rebalance(
        uint256 wdkTargetBps,
        uint256 lendingTargetBps,
        address executor,
        uint256 bountyBps,
        uint256 lpTargetBps
    ) external nonReentrant onlyEngine {
        if (!configurationLocked) revert OmniAgentVault__NotLocked();

        uint256 preRawAssets = rawTotalAssets();
        uint256 preLocked = calculateLockedProfit();

        // Optional: trigger adapter harvest before measuring deltas
        _maybeHarvest();

        (uint256 total, address failingStart) = _totalAssetsInternal();
        if (failingStart != address(0)) revert OmniAgentVault__AdapterReportingFailure(failingStart);

        uint256 buffer = (total * idleBufferBps) / BPS_DENOMINATOR;
        uint256 deployable = total > buffer ? total - buffer : 0;

        if (address(secondaryAdapter) != address(0)) {
            uint256 secManaged = secondaryAdapter.managedAssets();
            if (secManaged > 0) secondaryAdapter.withdrawToVault(secManaged);
        }

        uint256 wdkTarget = (deployable * wdkTargetBps) / BPS_DENOMINATOR;
        uint256 currentWDK = address(wdkAdapter) != address(0) ? wdkAdapter.managedAssets() : 0;

        // --- Phase 1: Withdrawals (Reclaim liquidity) ---
        if (address(wdkAdapter) != address(0) && currentWDK > wdkTarget) {
            try wdkAdapter.withdrawToVault(currentWDK - wdkTarget) {} catch { 
                emit WDKWithdrawFailed(currentWDK - wdkTarget); 
            }
        }
        _rebalanceLpWithdraw(deployable, lpTargetBps);
        _rebalanceLendingWithdraw(deployable, lendingTargetBps);

        // --- Phase 2: Deposits (Allocate liquidity) ---
        uint256 updatedWDK = address(wdkAdapter) != address(0) ? wdkAdapter.managedAssets() : 0;
        if (address(wdkAdapter) != address(0) && wdkTarget > updatedWDK) {
            uint256 toSend = Math.min(wdkTarget - updatedWDK, _availableIdle(buffer));
            if (toSend > 0) wdkAdapter.onVaultDeposit(toSend);
        }
        _rebalanceLpDeposit(deployable, lpTargetBps, buffer);
        _rebalanceLendingDeposit(deployable, lendingTargetBps, buffer);
        
        _payExecutorBounty(executor, bountyBps, total);
        _rebalanceSecondary(buffer);

        uint256 postRawAssets = rawTotalAssets();
        
        if (postRawAssets > preRawAssets) {
            uint256 profit = postRawAssets - preRawAssets;
            lockedProfit = preLocked + profit;
            lastReport = block.timestamp;
        } else if (preRawAssets > postRawAssets) {
            uint256 loss = preRawAssets - postRawAssets;
            if (preLocked > loss) {
                lockedProfit = preLocked - loss;
            } else {
                lockedProfit = 0;
            }
            lastReport = block.timestamp;
        }

        emit Rebalanced(
            wdkTarget,
            address(wdkAdapter) != address(0) ? wdkAdapter.managedAssets() : 0,
            _idleAssets(),
            address(secondaryAdapter) != address(0) ? secondaryAdapter.managedAssets() : 0,
            address(lpAdapter) != address(0) ? lpAdapter.managedAssets() : 0,
            address(lendingAdapter) != address(0) ? lendingAdapter.managedAssets() : 0
        );
    }

    function _maybeHarvest() internal {
        if (address(lpAdapter) == address(0)) return;
        (bool ok, ) = address(lpAdapter).call(
            abi.encodeWithSignature("harvestRewards()")
        );
        // Best effort
    }

    function _availableIdle(uint256 buffer) internal view returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this)) + _venusUnderlyingBalance();
        return idle > buffer ? idle - buffer : 0;
    }

    function _rebalanceLpWithdraw(uint256 deployable, uint256 lpTargetBps) internal {
        if (address(lpAdapter) == address(0)) return;
        uint256 lpTarget = (deployable * lpTargetBps) / BPS_DENOMINATOR;
        uint256 currentLp = lpAdapter.managedAssets();
        if (currentLp > lpTarget) {
            lpAdapter.withdrawToVault(currentLp - lpTarget);
        }
    }

    function _rebalanceLpDeposit(uint256 deployable, uint256 lpTargetBps, uint256 buffer) internal {
        if (address(lpAdapter) == address(0) || lpTargetBps == 0) return;
        uint256 lpTarget = (deployable * lpTargetBps) / BPS_DENOMINATOR;
        uint256 currentLp = lpAdapter.managedAssets();
        if (lpTarget > currentLp) {
            uint256 toSend = Math.min(lpTarget - currentLp, _availableIdle(buffer));
            if (toSend > 0) lpAdapter.onVaultDeposit(toSend);
        }
    }

    function _rebalanceLendingWithdraw(uint256 deployable, uint256 lendingTargetBps) internal {
        if (address(lendingAdapter) == address(0)) return;
        uint256 lendingTarget = (deployable * lendingTargetBps) / BPS_DENOMINATOR;
        uint256 currentLending = lendingAdapter.managedAssets();
        if (currentLending > lendingTarget) {
            lendingAdapter.withdrawToVault(currentLending - lendingTarget);
        }
    }

    function _rebalanceLendingDeposit(uint256 deployable, uint256 lendingTargetBps, uint256 buffer) internal {
        if (address(lendingAdapter) == address(0) || lendingTargetBps == 0) return;
        uint256 lendingTarget = (deployable * lendingTargetBps) / BPS_DENOMINATOR;
        uint256 currentLending = lendingAdapter.managedAssets();
        if (lendingTarget > currentLending) {
            uint256 toSend = Math.min(lendingTarget - currentLending, _availableIdle(buffer));
            if (toSend > 0) lendingAdapter.onVaultDeposit(toSend);
        }
    }

    function _rebalanceSecondary(uint256 buffer) internal {
        if (address(secondaryAdapter) == address(0)) return;
        uint256 idle = IERC20(asset()).balanceOf(address(this)) + _venusUnderlyingBalance();
        if (idle > buffer) secondaryAdapter.onVaultDeposit(idle - buffer);
    }

    function _payExecutorBounty(address executor, uint256 bountyBps, uint256 totalAssets_) internal {
        if (bountyBps == 0 || executor == address(0)) return;
        uint256 bounty = (totalAssets_ * bountyBps) / BPS_DENOMINATOR;
        uint256 available = IERC20(asset()).balanceOf(address(this));
        bounty = Math.min(bounty, available);
        if (bounty > 0) {
            IERC20(asset()).safeTransfer(executor, bounty);
            emit BountyPaid(executor, bounty);
        }
    }

    function bufferStatus() external view returns (uint256 current, uint256 target, uint256 utilizationBps) {
        target = (totalAssets() * idleBufferBps) / BPS_DENOMINATOR;
        current = IERC20(asset()).balanceOf(address(this));
        if (target > 0) {
            utilizationBps = (current * BPS_DENOMINATOR) / target;
        } else {
            utilizationBps = current > 0 ? BPS_DENOMINATOR : 0;
        }
    }

    function executeFlashRebalanceStep(
        address fromAdapter,
        address toAdapter,
        uint256 amount,
        uint256 repaymentAmount,
        address flashPool
    ) external nonReentrant onlyEngine {
        if (!_isConfiguredAdapter(fromAdapter) || !_isConfiguredAdapter(toAdapter)) revert OmniAgentVault__InvalidFlashAdapter();
        IERC20(asset()).safeTransfer(toAdapter, amount);
        IManagedAdapter(toAdapter).onVaultDeposit(amount);
        uint256 withdrawn = IManagedAdapter(fromAdapter).withdrawToVault(repaymentAmount);
        if (withdrawn < repaymentAmount) revert OmniAgentVault__InsufficientLiquidity();
        IERC20(asset()).safeTransfer(flashPool, repaymentAmount);
    }

    function _isConfiguredAdapter(address adapter) internal view returns (bool) {
        return adapter == address(wdkAdapter) || 
               adapter == address(secondaryAdapter) || 
               adapter == address(lpAdapter) ||
               adapter == address(lendingAdapter);
    }

    /// @dev 5-tier liquidity waterfall: idle -> Venus -> lending -> LP -> secondary -> WDK
    function _ensureLiquid(uint256 needed) internal {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (idle >= needed) return;

        // Tier 1: Pull from Venus
        if (address(venusVToken) != address(0)) {
            uint256 venusIdle = _venusUnderlyingBalance();
            if (venusIdle > 0) {
                uint256 still = needed - idle;
                _redeemFromVenus(Math.min(still, venusIdle));
                idle = IERC20(asset()).balanceOf(address(this));
                if (idle >= needed) return;
            }
        }

        // Tier 2: Pull from lending adapter (Aave)
        if (address(lendingAdapter) != address(0)) {
            uint256 lendingAvail = lendingAdapter.managedAssets();
            if (lendingAvail > 0) {
                uint256 still = needed - idle;
                lendingAdapter.withdrawToVault(Math.min(still, lendingAvail));
                idle = IERC20(asset()).balanceOf(address(this));
                if (idle >= needed) return;
            }
        }

        // Tier 3: Pull from LP adapter
        if (address(lpAdapter) != address(0)) {
            uint256 lpAvail = lpAdapter.managedAssets();
            if (lpAvail > 0) {
                uint256 still = needed - idle;
                lpAdapter.withdrawToVault(Math.min(still, lpAvail));
                idle = IERC20(asset()).balanceOf(address(this));
                if (idle >= needed) return;
            }
        }

        // Tier 4: Pull from secondary adapter
        if (address(secondaryAdapter) != address(0)) {
            uint256 secAvail = secondaryAdapter.managedAssets();
            if (secAvail > 0) {
                uint256 still = needed - idle;
                secondaryAdapter.withdrawToVault(Math.min(still, secAvail));
                idle = IERC20(asset()).balanceOf(address(this));
                if (idle >= needed) return;
            }
        }

        // Tier 5: Pull from WDK adapter (synchronous)
        if (address(wdkAdapter) != address(0)) {
            uint256 wdkAvail = wdkAdapter.managedAssets();
            if (wdkAvail > 0) {
                uint256 still = needed - idle;
                wdkAdapter.withdrawToVault(Math.min(still, wdkAvail));
                idle = IERC20(asset()).balanceOf(address(this));
                if (idle >= needed) return;
            }
        }

        if (IERC20(asset()).balanceOf(address(this)) < needed) revert OmniAgentVault__InsufficientLiquidity();
    }

    function _redeemFromVenus(uint256 amount) internal {
        uint256 result = venusVToken.redeemUnderlying(amount);
        if (result != 0) revert OmniAgentVault__VenusRedeemFailed(result);
    }

    function _mintToVenus(uint256 amount) internal {
        uint256 result = venusVToken.mint(amount);
        if (result != 0) revert OmniAgentVault__VenusMintFailed(result);
    }

    function _decimalsOffset() internal view override returns (uint8) {
        return 6;
    }

    function deposit(uint256 assets, address receiver) public override returns (uint256 shares) {
        if (!configurationLocked) revert OmniAgentVault__NotLocked();
        shares = super.deposit(assets, receiver);
        userPrincipal[receiver] += assets;
        return shares;
    }

    function mint(uint256 shares, address receiver) public override returns (uint256 assets) {
        if (!configurationLocked) revert OmniAgentVault__NotLocked();
        assets = super.mint(shares, receiver);
        userPrincipal[receiver] += assets;
        return assets;
    }

    function withdraw(uint256 assets, address receiver, address owner_) public override nonReentrant returns (uint256) {
        if (!configurationLocked) revert OmniAgentVault__NotLocked();
        _ensureLiquid(assets);
        uint256 shares = super.withdraw(assets, receiver, owner_);
        if (userPrincipal[owner_] > assets) {
            userPrincipal[owner_] -= assets;
        } else {
            userPrincipal[owner_] = 0;
        }
        return shares;
    }

    function redeem(uint256 shares, address receiver, address owner_) public override nonReentrant returns (uint256) {
        if (!configurationLocked) revert OmniAgentVault__NotLocked();
        uint256 assets = previewRedeem(shares);
        _ensureLiquid(assets);
        uint256 returnedAssets = super.redeem(shares, receiver, owner_);
        if (userPrincipal[owner_] > returnedAssets) {
            userPrincipal[owner_] -= returnedAssets;
        } else {
            userPrincipal[owner_] = 0;
        }
        return returnedAssets;
    }

    /**
     * @notice Allows a user to withdraw only their accrued yield, without touching principal.
     */
    function withdrawYield(address receiver) external nonReentrant returns (uint256 yieldAmount) {
        if (!configurationLocked) revert OmniAgentVault__NotLocked();
        uint256 maxWithdrawable = maxWithdraw(msg.sender);
        uint256 principal = userPrincipal[msg.sender];
        
        if (maxWithdrawable <= principal) {
            return 0; // No yield accrued
        }
        
        yieldAmount = maxWithdrawable - principal;
        _ensureLiquid(yieldAmount);
        
        uint256 sharesToBurn = previewWithdraw(yieldAmount);
        _burn(msg.sender, sharesToBurn);
        IERC20(asset()).safeTransfer(receiver, yieldAmount);
        
        emit YieldWithdrawn(msg.sender, receiver, yieldAmount);
        return yieldAmount;
    }

    receive() external payable {}
}

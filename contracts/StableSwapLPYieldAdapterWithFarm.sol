// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IManagedAdapter} from "./interfaces/IManagedAdapter.sol";
import {IStableSwapPool} from "./interfaces/IStableSwapPool.sol";
import {IMasterChef} from "./interfaces/IMasterChef.sol";
import {IPancakeRouter} from "./interfaces/IPancakeRouter.sol";

/// @title StableSwapLPYieldAdapterWithFarm
/// @notice 3rd yield rail: deposits USDT into PCS StableSwap pool, stakes LP in MasterChef, harvests CAKE rewards.
/// @dev Coin index 0 = WDKS, 1 = USDT in the PCS pool.
///      Implements full "robot route": LP deposit → MasterChef staking → CAKE harvest → swap → redeploy.
///
///      SECURITY NOTE: harvestRewards() is permissionless — anyone may trigger it.
///      All harvested USDT is forwarded to vault, never to the caller.
///      This is intentional: StrategyEngine calls it via low-level call during executeCycle().
/// @custom:security-contact security@wdkpilot.xyz
contract StableSwapLPYieldAdapterWithFarm is Ownable2Step, ReentrancyGuard, IManagedAdapter {
    using SafeERC20 for IERC20;

    // ── errors ──
    error StableSwapLP__OnlyVault();
    error StableSwapLP__ConfigurationLocked();
    error StableSwapLP__ZeroAddress();
    error StableSwapLP__VaultNotSet();
    error StableSwapLP__ZeroAmount();
    error StableSwapLP__SlippageTooHigh();
    error StableSwapLP__HarvestNotProfitable();

    // ── Immutables ──────────────────────────────────────────────────────────
    IERC20 public immutable usdt;
    IERC20 public immutable lpToken;
    IERC20 public immutable cake;
    address public immutable wbnb;
    IStableSwapPool public immutable pool;
    IMasterChef public immutable masterChef;
    IPancakeRouter public immutable router;
    uint256 public immutable poolId;

    // ── Storage ─────────────────────────────────────────────────────────────
    address public vault;
    bool public configurationLocked;

    uint256 public minCakeHarvestAmount;
    uint256 public harvestSlippageBps;
    uint256 public harvestGasEstimate;    // estimated gas units for harvest tx (default 350_000)
    uint256 public harvestGasMultiplier;  // reward must be >= multiplier × gas cost (default 3)

    // ── Constants ───────────────────────────────────────────────────────────
    uint256 private constant USDT_INDEX = 1;
    uint256 private constant VP_PRECISION = 1e18;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    // ── Events ──────────────────────────────────────────────────────────────
    event VaultUpdated(address indexed vaultAddress);
    event LiquidityAdded(uint256 usdtIn, uint256 lpMinted);
    event LiquidityRemoved(uint256 lpBurned, uint256 usdtOut);
    event LPStaked(uint256 lpAmount);
    event LPUnstaked(uint256 lpAmount);
    event RewardsHarvested(uint256 cakeHarvested, uint256 usdtReceived);
    event ConfigurationLocked();
    event HarvestSettingsUpdated(uint256 minCakeAmount, uint256 slippageBps, uint256 gasEstimate, uint256 gasMultiplier);
    event HarvestSkippedUnprofitable(uint256 cakeValue, uint256 gasCost);

    constructor(
        address usdt_,
        address lpToken_,
        address cake_,
        address wbnb_,
        address pool_,
        address masterChef_,
        address router_,
        uint256 poolId_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (usdt_ == address(0)) revert StableSwapLP__ZeroAddress();
        if (lpToken_ == address(0)) revert StableSwapLP__ZeroAddress();
        if (cake_ == address(0)) revert StableSwapLP__ZeroAddress();
        if (wbnb_ == address(0)) revert StableSwapLP__ZeroAddress();
        if (pool_ == address(0)) revert StableSwapLP__ZeroAddress();
        if (masterChef_ == address(0)) revert StableSwapLP__ZeroAddress();
        if (router_ == address(0)) revert StableSwapLP__ZeroAddress();

        usdt = IERC20(usdt_);
        lpToken = IERC20(lpToken_);
        cake = IERC20(cake_);
        wbnb = wbnb_;
        pool = IStableSwapPool(pool_);
        masterChef = IMasterChef(masterChef_);
        router = IPancakeRouter(router_);
        poolId = poolId_;

        // Default harvest settings (can be updated before lock)
        minCakeHarvestAmount  = 1e18;    // 1 CAKE minimum
        harvestSlippageBps    = 100;     // 1% max slippage
        harvestGasEstimate    = 350_000; // estimated gas for harvest
        harvestGasMultiplier  = 3;       // reward must be >= 3× gas cost
    }

    modifier onlyVault() {
        if (msg.sender != vault) revert StableSwapLP__OnlyVault();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                      IMANAGEDADAPTER IMPLEMENTATION
    //////////////////////////////////////////////////////////////*/

    function asset() external view returns (address) {
        return address(usdt);
    }

    /// @notice Returns total USDT value: staked LP (in MasterChef) + unstaked LP + idle USDT
    function managedAssets() external view returns (uint256) {
        (uint256 stakedLp, ) = masterChef.userInfo(poolId, address(this));
        uint256 unstakedLp = lpToken.balanceOf(address(this));
        uint256 totalLp = stakedLp + unstakedLp;

        uint256 lpValue;
        if (totalLp > 0) {
            uint256 vp = pool.get_virtual_price(); // 1e18 = $1 per LP
            lpValue = (totalLp * vp) / VP_PRECISION;
        }

        return lpValue + usdt.balanceOf(address(this));
    }

    /// @notice Called by vault after transferring USDT to this adapter.
    ///         Flow: USDT → LP (via pool) → stake LP (via MasterChef)
    function onVaultDeposit(uint256 amount) external onlyVault nonReentrant {
        if (amount == 0) revert StableSwapLP__ZeroAmount();

        // Pull tokens from vault
        SafeERC20.safeTransferFrom(usdt, msg.sender, address(this), amount);

        // 1. Add liquidity to StableSwap pool with slippage protection
        uint256[2] memory amounts;
        amounts[USDT_INDEX] = amount;

        // Estimate minimum LP out using virtual_price (1% slippage tolerance via harvestSlippageBps)
        uint256 vp = pool.get_virtual_price();
        uint256 minLpOut = amount * VP_PRECISION / vp;
        minLpOut = minLpOut * (BPS_DENOMINATOR - harvestSlippageBps) / BPS_DENOMINATOR;

        usdt.forceApprove(address(pool), amount);
        uint256 lpMinted = pool.add_liquidity(amounts, minLpOut);
        usdt.forceApprove(address(pool), 0);
        emit LiquidityAdded(amount, lpMinted);

        // 2. Stake LP tokens in MasterChef
        if (lpMinted > 0) {
            lpToken.forceApprove(address(masterChef), lpMinted);
            masterChef.deposit(poolId, lpMinted);
            emit LPStaked(lpMinted);
        }
    }

    /// @notice Removes LP and returns USDT to vault
    ///         Flow: Unstake LP (from MasterChef) → LP → USDT (via pool)
    function withdrawToVault(uint256 amount) external onlyVault nonReentrant returns (uint256) {
        if (amount == 0) return 0;

        // 1. Calculate LP needed for requested USDT amount
        uint256 vp = pool.get_virtual_price();
        uint256 lpNeeded = (amount * VP_PRECISION) / vp;

        // 2. Check unstaked LP balance first
        uint256 unstakedLp = lpToken.balanceOf(address(this));

        // 3. If not enough unstaked LP, withdraw from MasterChef
        if (unstakedLp < lpNeeded) {
            (uint256 stakedLp, ) = masterChef.userInfo(poolId, address(this));
            uint256 toUnstake = lpNeeded - unstakedLp;
            if (toUnstake > stakedLp) toUnstake = stakedLp;

            if (toUnstake > 0) {
                masterChef.withdraw(poolId, toUnstake);
                emit LPUnstaked(toUnstake);
            }
        }

        // 4. Remove liquidity from pool with slippage protection
        uint256 lpBal = lpToken.balanceOf(address(this));
        if (lpBal == 0) return 0;

        uint256 lpToBurn = lpNeeded > lpBal ? lpBal : lpNeeded;

        // Minimum USDT out: account for pool fee (use harvestSlippageBps as tolerance)
        uint256 minUsdtOut = lpToBurn * vp / VP_PRECISION;
        minUsdtOut = minUsdtOut * (BPS_DENOMINATOR - harvestSlippageBps) / BPS_DENOMINATOR;

        lpToken.forceApprove(address(pool), lpToBurn);
        uint256 usdtOut = pool.remove_liquidity_one_coin(lpToBurn, int128(int256(USDT_INDEX)), minUsdtOut);
        lpToken.forceApprove(address(pool), 0);

        // 5. Transfer USDT back to vault
        SafeERC20.safeTransfer(usdt, msg.sender, usdtOut);
        emit LiquidityRemoved(lpToBurn, usdtOut);
        return usdtOut;
    }

    /*//////////////////////////////////////////////////////////////
                    REWARD HARVESTING (CAKE → USDT → VAULT)
    //////////////////////////////////////////////////////////////*/

    /// @notice Harvest CAKE rewards from MasterChef, swap to USDT, forward to vault.
    /// @dev Permissionless: output always goes to vault, not the caller.
    ///      StrategyEngine calls this during executeCycle() via low-level call.
    /// @return usdtReturned USDT amount transferred back to vault
    function harvestRewards() external nonReentrant returns (uint256 usdtReturned) {
        // 1. Harvest CAKE by depositing 0 (standard MasterChef harvest pattern)
        masterChef.deposit(poolId, 0);

        // 2. Check harvested CAKE balance
        uint256 cakeBalance = cake.balanceOf(address(this));
        if (cakeBalance < minCakeHarvestAmount) {
            return 0; // Below absolute minimum
        }

        // 2b. Gas-gated profitability check
        if (harvestGasEstimate > 0 && harvestGasMultiplier > 0 && tx.gasprice > 0) {
            uint256 gasCostBnb = harvestGasEstimate * tx.gasprice;
            // Convert gas cost (BNB) → USDT via router
            address[] memory gasPath = new address[](2);
            gasPath[0] = wbnb;
            gasPath[1] = address(usdt);
            try router.getAmountsOut(gasCostBnb, gasPath) returns (uint256[] memory gasAmounts) {
                uint256 gasCostUsdt = gasAmounts[1] * harvestGasMultiplier;
                // Preview CAKE → USDT value
                address[] memory cakePath = new address[](2);
                cakePath[0] = address(cake);
                cakePath[1] = address(usdt);
                uint256[] memory cakeAmounts = router.getAmountsOut(cakeBalance, cakePath);
                if (cakeAmounts[1] < gasCostUsdt) {
                    emit HarvestSkippedUnprofitable(cakeAmounts[1], gasCostUsdt);
                    return 0; // Not profitable after gas
                }
            } catch {
                // If gas estimation fails, fall through to harvest (conservative)
            }
        }

        // 3. Swap CAKE → USDT via PancakeSwap router
        address[] memory path = new address[](2);
        path[0] = address(cake);
        path[1] = address(usdt);

        uint256[] memory amountsOut = router.getAmountsOut(cakeBalance, path);
        uint256 minUsdtOut = amountsOut[1] * (BPS_DENOMINATOR - harvestSlippageBps) / BPS_DENOMINATOR;

        cake.forceApprove(address(router), cakeBalance);
        uint256[] memory amounts = router.swapExactTokensForTokens(
            cakeBalance,
            minUsdtOut,
            path,
            address(this),
            block.timestamp + 300 // 5 min deadline
        );
        cake.forceApprove(address(router), 0);

        uint256 usdtReceived = amounts[1];

        // 4. Forward USDT to vault for redeployment
        if (usdtReceived > 0) {
            usdt.safeTransfer(vault, usdtReceived);
        }

        emit RewardsHarvested(cakeBalance, usdtReceived);
        return usdtReceived;
    }

    /// @notice Preview pending CAKE rewards without harvesting
    function pendingRewards() external view returns (uint256) {
        return masterChef.pendingCake(poolId, address(this));
    }

    /// @notice Get staking info
    function stakingInfo() external view returns (uint256 staked, uint256 unstaked, uint256 pending) {
        (staked, ) = masterChef.userInfo(poolId, address(this));
        unstaked = lpToken.balanceOf(address(this));
        pending = masterChef.pendingCake(poolId, address(this));
    }

    /*//////////////////////////////////////////////////////////////
                    ADMIN (CONFIGURATION BEFORE LOCK)
    //////////////////////////////////////////////////////////////*/

    function setVault(address vault_) external onlyOwner {
        if (configurationLocked) revert StableSwapLP__ConfigurationLocked();
        if (vault_ == address(0)) revert StableSwapLP__ZeroAddress();
        vault = vault_;
        emit VaultUpdated(vault_);
    }

    function setHarvestSettings(
        uint256 minCakeAmount_,
        uint256 slippageBps_,
        uint256 gasEstimate_,
        uint256 gasMultiplier_
    ) external onlyOwner {
        if (configurationLocked) revert StableSwapLP__ConfigurationLocked();
        if (slippageBps_ > 1000) revert StableSwapLP__SlippageTooHigh();
        minCakeHarvestAmount  = minCakeAmount_;
        harvestSlippageBps    = slippageBps_;
        harvestGasEstimate    = gasEstimate_;
        harvestGasMultiplier  = gasMultiplier_;
        emit HarvestSettingsUpdated(minCakeAmount_, slippageBps_, gasEstimate_, gasMultiplier_);
    }

    function lockConfiguration() external onlyOwner {
        if (configurationLocked) revert StableSwapLP__ConfigurationLocked();
        if (vault == address(0)) revert StableSwapLP__VaultNotSet();
        configurationLocked = true;
        emit ConfigurationLocked();
        renounceOwnership();
    }

    /*//////////////////////////////////////////////////////////////
                    EMERGENCY (CALLABLE BEFORE OWNERSHIP RENOUNCED)
    //////////////////////////////////////////////////////////////*/

    /// @notice Emergency unstake all LP from MasterChef (before ownership renounced)
    function emergencyUnstakeAll() external onlyOwner {
        (uint256 staked, ) = masterChef.userInfo(poolId, address(this));
        if (staked > 0) {
            masterChef.withdraw(poolId, staked);
            emit LPUnstaked(staked);
        }
    }
}

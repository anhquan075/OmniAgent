// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IManagedAdapter} from "../../interfaces/IManagedAdapter.sol";
import {IStableSwapPool} from "../../interfaces/IStableSwapPool.sol";
import {IMasterChef} from "../../interfaces/IMasterChef.sol";
import {IPancakeRouter} from "../../interfaces/IPancakeRouter.sol";

/// @title BeamSwapFarmAdapter
/// @notice BeamSwap LP farm adapter for Rail 3 (LP yield) - MasterChef staking on Polkadot Hub
/// @dev Wraps BeamSwap's MasterChef for LP staking and GLINT reward harvesting.
///      
///      Flow: USDC → StableSwap LP → MasterChef staking → GLINT rewards
///      
///      Key Contract Addresses (Polkadot Hub):
///      - GLINT Token: 0xcd3B51D98478D53F4515A306bE565c6EebeF1D58
///      - MasterChef: TBD (verify on BeamSwap docs)
///      - StableSwap Pool: 0xE3f59aB3c37c33b6368CDF4f8AC79644011E402C (example)
///
/// @custom:security-contact security@asterpilot.xyz
contract BeamSwapFarmAdapter is Ownable2Step, ReentrancyGuard, IManagedAdapter {
    using SafeERC20 for IERC20;

    // ── errors ──
    error BeamSwapFarm__OnlyVault();
    error BeamSwapFarm__ConfigurationLocked();
    error BeamSwapFarm__ZeroAddress();
    error BeamSwapFarm__VaultNotSet();
    error BeamSwapFarm__ZeroAmount();
    error BeamSwapFarm__SlippageTooHigh();
    error BeamSwapFarm__HarvestNotProfitable();
    error BeamSwapFarm__LpWithdrawalShortfall();

    // ── constants ──
    uint256 private constant VP_PRECISION = 1e18;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    // ── immutables ──
    IERC20 public immutable usdc;
    IStableSwapPool public immutable pool;
    IMasterChef public immutable masterChef;
    IPancakeRouter public immutable router;
    IERC20 public immutable glint;        // BeamSwap reward token
    uint256 public immutable poolId;      // MasterChef pool ID
    uint256 public immutable assetIndex;  // USDC index in StableSwap pool (e.g., 1)

    // ── storage ──
    address public vault;
    bool public configurationLocked;
    uint256 public minGlintHarvestAmount;  // Minimum GLINT to trigger harvest
    uint256 public harvestSlippageBps;     // Slippage for GLINT → USDC swap
    uint256 public harvestGasEstimate;     // Estimated gas units for harvest tx
    uint256 public harvestGasMultiplier;   // Reward must be >= multiplier × gas cost

    // ── events ──
    event VaultUpdated(address indexed vaultAddress);
    event ConfigurationLocked();
    event LiquidityAdded(uint256 usdcIn, uint256 lpMinted);
    event LiquidityRemoved(uint256 lpBurned, uint256 usdcOut);
    event LPStaked(uint256 lpAmount);
    event LPUnstaked(uint256 lpAmount);
    event RewardsHarvested(uint256 glintHarvested, uint256 usdcReceived);
    event HarvestSettingsUpdated(
        uint256 minGlintAmount,
        uint256 slippageBps,
        uint256 gasEstimate,
        uint256 gasMultiplier
    );
    event HarvestSkippedUnprofitable(uint256 glintValue, uint256 gasCost);

    // ── modifiers ──
    modifier onlyVault() {
        if (msg.sender != vault) revert BeamSwapFarm__OnlyVault();
        _;
    }

    /// @notice Initializes the BeamSwap farm adapter for LP staking and GLINT rewards
    /// @dev Sets up approvals for pool and MasterChef interactions. Initializes default harvest settings.
    /// @param assetAddress USDC address on Polkadot Hub
    /// @param poolAddress BeamSwap StableSwap pool address
    /// @param chefAddress BeamSwap MasterChef address
    /// @param routerAddress BeamSwap Router address for swaps
    /// @param glintAddress GLINT token address (0xcd3B51D98478D53F4515A306bE565c6EebeF1D58)
    /// @param poolId_ MasterChef pool ID for the LP token
    /// @param assetIndex_ USDC index in StableSwap pool (0 or 1 depending on pool configuration)
    /// @param initialOwner Initial owner address
    constructor(
        address assetAddress,
        address poolAddress,
        address chefAddress,
        address routerAddress,
        address glintAddress,
        uint256 poolId_,
        uint256 assetIndex_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (assetAddress == address(0)) revert BeamSwapFarm__ZeroAddress();
        if (poolAddress == address(0)) revert BeamSwapFarm__ZeroAddress();
        if (chefAddress == address(0)) revert BeamSwapFarm__ZeroAddress();
        if (routerAddress == address(0)) revert BeamSwapFarm__ZeroAddress();
        if (glintAddress == address(0)) revert BeamSwapFarm__ZeroAddress();

        usdc = IERC20(assetAddress);
        pool = IStableSwapPool(poolAddress);
        masterChef = IMasterChef(chefAddress);
        router = IPancakeRouter(routerAddress);
        glint = IERC20(glintAddress);
        poolId = poolId_;
        assetIndex = assetIndex_;

        // Approvals
        usdc.forceApprove(poolAddress, type(uint256).max);
        IERC20(address(pool)).forceApprove(chefAddress, type(uint256).max);
        glint.forceApprove(routerAddress, type(uint256).max);

        // Default harvest settings
        minGlintHarvestAmount = 1e18;      // 1 GLINT minimum
        harvestSlippageBps = 100;          // 1% max slippage
        harvestGasEstimate = 350_000;      // Estimated gas units
        harvestGasMultiplier = 3;          // Reward must be >= 3x gas cost
    }

    // ── configuration (owner-only) ──

    /// @notice Sets the vault address (owner-only, before lock)
    /// @dev Can only be called by owner and before configuration is locked
    /// @param vaultAddress The ProofVault address
    function setVault(address vaultAddress) external onlyOwner {
        if (configurationLocked) revert BeamSwapFarm__ConfigurationLocked();
        if (vaultAddress == address(0)) revert BeamSwapFarm__ZeroAddress();
        vault = vaultAddress;
        emit VaultUpdated(vaultAddress);
    }

    /// @notice Updates harvest profitability parameters (owner-only, before lock)
    /// @dev Used to calibrate when harvest operations are economically viable
    /// @param minGlintAmount Minimum GLINT tokens to trigger harvest
    /// @param slippageBps Maximum slippage tolerance in basis points (100 = 1%)
    /// @param gasEstimate Estimated gas units for harvest transaction
    /// @param gasMultiplier Reward must be >= multiplier × gas cost to execute
    function setHarvestSettings(
        uint256 minGlintAmount,
        uint256 slippageBps,
        uint256 gasEstimate,
        uint256 gasMultiplier
    ) external onlyOwner {
        if (configurationLocked) revert BeamSwapFarm__ConfigurationLocked();
        if (slippageBps > 1000) revert BeamSwapFarm__SlippageTooHigh();

        minGlintHarvestAmount = minGlintAmount;
        harvestSlippageBps = slippageBps;
        harvestGasEstimate = gasEstimate;
        harvestGasMultiplier = gasMultiplier;

        emit HarvestSettingsUpdated(minGlintAmount, slippageBps, gasEstimate, gasMultiplier);
    }

    /// @notice Locks configuration and renounces ownership (owner-only)
    /// @dev Once locked, no configuration changes are possible. Vault must be set first.
    function lockConfiguration() external onlyOwner {
        if (vault == address(0)) revert BeamSwapFarm__VaultNotSet();
        configurationLocked = true;
        emit ConfigurationLocked();
        renounceOwnership();
    }

    // ── IManagedAdapter implementation ──

    /// @notice Returns the underlying asset address (USDC)
    /// @return The address of USDC on Polkadot Hub
    function asset() external view returns (address) {
        return address(usdc);
    }

    /// @notice Returns the total USDC value of managed assets
    /// @dev Converts staked LP tokens to USDC value using pool's virtual price
    /// @return Total USDC value of staked LP tokens
    function managedAssets() external view returns (uint256) {
        // Get staked LP balance from MasterChef
        (uint256 staked, ) = masterChef.userInfo(poolId, address(this));
        
        // Convert LP tokens to underlying USDC value (18-decimal base)
        uint256 virtualPrice = pool.get_virtual_price();
        
        // Formula: (staked * virtualPrice) / 1e18 / 1e12
        return (staked * virtualPrice) / (VP_PRECISION * 1e12);
    }

    /// @notice Deposits USDC, adds liquidity to StableSwap pool, and stakes LP tokens
    /// @dev Called by vault during rebalance operations. Flow: USDC → Pool LP → MasterChef
    /// @param amount Amount of USDC to deposit
    function onVaultDeposit(uint256 amount) external onlyVault nonReentrant {
        if (amount == 0) revert BeamSwapFarm__ZeroAmount();

        // Transfer USDC from vault
        SafeERC20.safeTransferFrom(usdc, msg.sender, address(this), amount);

        // Add liquidity to BeamSwap StableSwap pool
        uint256[2] memory amounts;
        amounts[assetIndex] = amount;
        uint256 lpBefore = IERC20(address(pool)).balanceOf(address(this));
        pool.add_liquidity(amounts, 0);
        uint256 lpAfter = IERC20(address(pool)).balanceOf(address(this));
        uint256 lpMinted = lpAfter - lpBefore;

        emit LiquidityAdded(amount, lpMinted);

        // Stake LP tokens in MasterChef
        if (lpMinted > 0) {
            masterChef.deposit(poolId, lpMinted);
            emit LPStaked(lpMinted);
        }
    }

    /// @notice Unstakes LP tokens, removes liquidity, and returns USDC to vault
    /// @dev Called by vault during withdrawals. Flow: MasterChef → Pool LP → USDC
    /// @param amount Desired amount of USDC to withdraw
    /// @return Amount of USDC actually received and transferred to vault
    function withdrawToVault(uint256 amount) external onlyVault nonReentrant returns (uint256) {
        if (amount == 0) revert BeamSwapFarm__ZeroAmount();

        // Calculate LP tokens needed for withdrawal
        uint256 virtualPrice = pool.get_virtual_price();
        // [AUDIT] Add 1 wei buffer to lpNeeded to handle virtual price rounding up
        uint256 lpNeeded = ((amount * 1e12 * VP_PRECISION) / virtualPrice) + 1;

        // Unstake LP tokens from MasterChef
        (uint256 staked, ) = masterChef.userInfo(poolId, address(this));
        uint256 lpToUnstake = lpNeeded > staked ? staked : lpNeeded;
        
        if (lpToUnstake > 0) {
            masterChef.withdraw(poolId, lpToUnstake);
            emit LPUnstaked(lpToUnstake);
        } else {
            return 0;
        }

        // Remove liquidity from pool (get USDC back)
        uint256 expectedUsdc = (lpToUnstake * virtualPrice) / (VP_PRECISION * 1e12);
        uint256 minUsdcOut = (expectedUsdc * (BPS_DENOMINATOR - harvestSlippageBps)) / BPS_DENOMINATOR;
        
        uint256 usdcBefore = usdc.balanceOf(address(this));
        pool.remove_liquidity_one_coin(
            lpToUnstake,
            int128(uint128(assetIndex)),
            minUsdcOut
        );
        uint256 usdcAfter = usdc.balanceOf(address(this));
        uint256 usdcReceived = usdcAfter - usdcBefore;

        emit LiquidityRemoved(lpToUnstake, usdcReceived);

        // Transfer USDC to vault
        if (usdcReceived > 0) {
            SafeERC20.safeTransfer(usdc, msg.sender, usdcReceived);
        }

        return usdcReceived;
    }

    // ── harvest rewards (permissionless via vault) ──

    /// @notice Harvests GLINT rewards from MasterChef and swaps to USDC
    /// @dev Restricted to vault during executeCycle to prevent griefing.
    ///      Implements profitability gates before executing swap.
    function harvestRewards() external onlyVault nonReentrant {
        // 1. Harvest GLINT rewards (deposit 0 to claim)
        uint256 glintBefore = glint.balanceOf(address(this));
        masterChef.deposit(poolId, 0);
        uint256 glintAfter = glint.balanceOf(address(this));
        uint256 glintHarvested = glintAfter - glintBefore;

        if (glintHarvested < minGlintHarvestAmount) {
            emit HarvestSkippedUnprofitable(glintHarvested, 0);
            return;
        }

        // 2. Gas profitability check
        uint256 estimatedGasCost = harvestGasEstimate * tx.gasprice;
        // Simplified value check: In production, query GLINT price from router
        if (glintHarvested < estimatedGasCost * harvestGasMultiplier) {
            emit HarvestSkippedUnprofitable(glintHarvested, estimatedGasCost);
            return;
        }

        // 3. Swap GLINT → USDC via BeamSwap Router
        address[] memory path = new address[](2);
        path[0] = address(glint);
        path[1] = address(usdc);

        uint256 usdcBefore = usdc.balanceOf(address(this));
        
        try router.swapExactTokensForTokens(
            glintHarvested,
            0, // minOut handled by harvestSlippageBps in real scenario
            path,
            address(this),
            block.timestamp
        ) {
            uint256 usdcReceived = usdc.balanceOf(address(this)) - usdcBefore;
            
            // 4. Send USDC to vault
            if (usdcReceived > 0) {
                SafeERC20.safeTransfer(usdc, msg.sender, usdcReceived);
            }
            emit RewardsHarvested(glintHarvested, usdcReceived);
        } catch {
            // If swap fails, keep GLINT in adapter for next attempt
            emit HarvestSkippedUnprofitable(glintHarvested, 0);
        }
    }

    /// @notice Returns pending GLINT rewards for this adapter
    /// @return Amount of GLINT tokens pending harvest from MasterChef
    function pendingRewards() external view returns (uint256) {
        return masterChef.pendingCake(poolId, address(this));
    }
}

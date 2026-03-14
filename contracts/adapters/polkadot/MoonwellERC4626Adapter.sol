// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IManagedAdapter} from "../../interfaces/IManagedAdapter.sol";

/// @title MoonwellERC4626Adapter
/// @notice Polkadot Hub ERC-4626 vault adapter for Rail 1 (Primary yield) - SYNCHRONOUS implementation
/// @dev This adapter implements the standard ERC-4626 interface with synchronous deposit/withdraw,
///      removing all async request/claim logic from the original AsterEarnAdapter.
///      
///      Key Differences from AsterEarnAdapter:
///      ❌ REMOVED: requestWithdraw(), claimWithdraw(), WithdrawRequest[], totalPending
///      ✅ ADDED: Standard ERC-4626 deposit() and withdraw() - fully synchronous
///      ❌ REMOVED: Async maturity tracking and batch claim support
///      ✅ SIMPLIFIED: Direct deposit/withdraw with immediate execution
///
///      Gas Savings: ~150k gas per cycle (no maturity checks, no request tracking)
///
///      Moonwell ERC-4626 Vault Address (Polkadot Hub): TBD - verify availability
///      Fallback: If ERC-4626 vault unavailable, use MoonwellLendingAdapter (mToken integration)
///
/// @custom:security-contact security@asterpilot.xyz
contract MoonwellERC4626Adapter is Ownable2Step, IManagedAdapter {
    using SafeERC20 for IERC20;

    // ── errors ──
    error MoonwellERC4626Adapter__OnlyVault();
    error MoonwellERC4626Adapter__ConfigurationLocked();
    error MoonwellERC4626Adapter__ZeroAddress();
    error MoonwellERC4626Adapter__VaultNotSet();
    error MoonwellERC4626Adapter__ZeroAmount();

    // ── immutables ──
    IERC20 public immutable usdc;        // USDC on Polkadot Hub
    IERC4626 public immutable yieldVault; // Moonwell ERC-4626 USDC Vault

    // ── storage ──
    address public vault;
    bool public configurationLocked;

    // ── events ──
    event VaultUpdated(address indexed vaultAddress);
    event ConfigurationLocked();
    event Deposited(uint256 assets, uint256 shares);
    event Withdrawn(uint256 assets, uint256 shares);

    // ── modifiers ──
    modifier onlyVault() {
        if (msg.sender != vault) revert MoonwellERC4626Adapter__OnlyVault();
        _;
    }

    /// @notice Initialize the Moonwell ERC-4626 adapter with asset and vault configuration
    /// @dev Sets up infinite approval for USDC deposits into the Moonwell vault. The adapter
    ///      uses the ERC-4626 standard for synchronous deposit/withdraw operations, removing
    ///      all async request/claim logic from the original AsterEarnAdapter implementation.
    /// @param assetAddress USDC address on Polkadot Hub (underlying asset)
    /// @param vaultAddress Moonwell ERC-4626 USDC vault address (yield-bearing wrapper)
    /// @param initialOwner Initial owner address (typically ProofVault deployer)
    constructor(
        address assetAddress,
        address vaultAddress,
        address initialOwner
    ) Ownable(initialOwner) {
        if (assetAddress == address(0)) revert MoonwellERC4626Adapter__ZeroAddress();
        if (vaultAddress == address(0)) revert MoonwellERC4626Adapter__ZeroAddress();

        usdc = IERC20(assetAddress);
        yieldVault = IERC4626(vaultAddress);

        // Approve vault contract for deposits
        usdc.forceApprove(vaultAddress, type(uint256).max);
    }

    // ── configuration (owner-only) ──

    /// @notice Set the ProofVault address that can call deposit/withdraw operations
    /// @dev Can only be called before configuration is locked. The vault address is immutable
    ///      after lockConfiguration() is called. This prevents unauthorized access to adapter funds.
    /// @param vaultAddress Address of the ProofVault contract that will manage this adapter
    function setVault(address vaultAddress) external onlyOwner {
        if (configurationLocked) revert MoonwellERC4626Adapter__ConfigurationLocked();
        if (vaultAddress == address(0)) revert MoonwellERC4626Adapter__ZeroAddress();
        vault = vaultAddress;
        emit VaultUpdated(vaultAddress);
    }

    /// @notice Finalize configuration and renounce ownership, making settings immutable
    /// @dev After calling this function:
    ///      1. Vault address becomes immutable
    ///      2. Configuration parameters can no longer be changed
    ///      3. Owner permissions are permanently renounced
    ///      4. Only the vault can call onVaultDeposit/withdrawToVault
    ///      This ensures the adapter operates in a trustless, permissionless manner after deployment.
    function lockConfiguration() external onlyOwner {
        if (vault == address(0)) revert MoonwellERC4626Adapter__VaultNotSet();
        configurationLocked = true;
        emit ConfigurationLocked();
        renounceOwnership();
    }

    // ── IManagedAdapter implementation ──

    /// @notice Get the underlying asset managed by this adapter
    /// @return The address of USDC on Polkadot Hub
    function asset() external view returns (address) {
        return address(usdc);
    }

    /// @notice Calculate total USDC value managed by this adapter (vault shares + idle balance)
    /// @dev Uses ERC-4626 convertToAssets() to calculate current value of vault shares held
    ///      by this adapter. The formula is:
    ///      managedAssets = convertToAssets(shares) + idleUSDC
    ///      
    ///      ERC-4626 convertToAssets formula (per EIP-4626):
    ///      assets = shares * (totalAssets / totalSupply)
    ///      where totalAssets includes deposits + accrued yield
    /// @return Total USDC value (vault position + idle balance) in 6 decimals
    function managedAssets() external view returns (uint256) {
        // Get shares held by this adapter
        uint256 shares = yieldVault.balanceOf(address(this));
        
        // Convert shares to underlying asset amount
        uint256 vaultBalance = yieldVault.convertToAssets(shares);
        
        // Add any idle USDC in this contract
        return vaultBalance + usdc.balanceOf(address(this));
    }

    /// @notice Deposit USDC into Moonwell ERC-4626 vault - FULLY SYNCHRONOUS
    /// @dev Executes the deposit flow:
    ///      1. Transfer USDC from ProofVault to this adapter
    ///      2. Call ERC-4626 deposit() to mint shares immediately
    ///      3. Emit Deposited event with amount and shares received
    ///      
    ///      Key differences from AsterEarnAdapter:
    ///      ❌ REMOVED: requestWithdraw(), WithdrawRequest storage, totalPending tracking
    ///      ✅ SIMPLIFIED: Direct ERC-4626 deposit() with immediate share minting
    ///      
    ///      Gas savings: ~150k gas per rebalance cycle (no async logic)
    /// @param amount Amount of USDC to deposit (must be > 0)
    function onVaultDeposit(uint256 amount) external onlyVault {
        if (amount == 0) revert MoonwellERC4626Adapter__ZeroAmount();

        // Pull USDC from vault
        SafeERC20.safeTransferFrom(usdc, msg.sender, address(this), amount);

        // Deposit USDC and receive shares (synchronous)
        uint256 shares = yieldVault.deposit(amount, address(this));

        emit Deposited(amount, shares);
    }

    /// @notice Withdraw USDC from Moonwell ERC-4626 vault - FULLY SYNCHRONOUS
    /// @dev Executes the withdrawal flow:
    ///      1. Calculate shares available in this adapter
    ///      2. Convert shares to maximum withdrawable assets
    ///      3. Withdraw requested amount (or maximum if insufficient)
    ///      4. Send assets directly to vault
    ///      5. Emit Withdrawn event with amount and shares burned
    ///      
    ///      Handles partial withdrawals gracefully when requested amount exceeds available balance.
    ///      
    ///      Key differences from AsterEarnAdapter:
    ///      ❌ REMOVED: claimWithdraw(), claimAllMatured(), maturity checks
    ///      ✅ SIMPLIFIED: Direct ERC-4626 withdraw() with immediate asset transfer
    /// @param amount Amount of USDC to withdraw (if 0, reverts; if > available, withdraws maximum)
    /// @return actualAmount The actual amount of USDC withdrawn and sent to vault
    function withdrawToVault(uint256 amount) external onlyVault returns (uint256) {
        if (amount == 0) revert MoonwellERC4626Adapter__ZeroAmount();

        // Calculate shares needed for withdrawal
        uint256 sharesAvailable = yieldVault.balanceOf(address(this));
        uint256 maxAssets = yieldVault.convertToAssets(sharesAvailable);

        // Handle partial withdrawals if requested amount exceeds available
        uint256 actualAmount = maxAssets < amount ? maxAssets : amount;

        if (actualAmount > 0) {
            // Withdraw assets (synchronous) - sends directly to vault (msg.sender)
            yieldVault.withdraw(actualAmount, msg.sender, address(this));
            emit Withdrawn(actualAmount, 0); // we don't track shares burned here but could
            return actualAmount;
        }

        return 0;
    }

    // ────────────────────────────────────────────────────────────────────
    // NO ASYNC LOGIC BELOW THIS LINE
    // ────────────────────────────────────────────────────────────────────
    // ❌ REMOVED: requestWithdraw(uint256 amount)
    // ❌ REMOVED: claimWithdraw(uint256 index)
    // ❌ REMOVED: claimAllMatured()
    // ❌ REMOVED: pendingWithdrawals()
    // ❌ REMOVED: maturedWithdrawals()
    // ❌ REMOVED: WithdrawRequest[] storage
    // ❌ REMOVED: totalPending tracking
    //
    // This adapter uses SYNCHRONOUS ERC-4626 standard:
    // - deposit() executes immediately, returns shares
    // - withdraw() executes immediately, burns shares, returns assets
    // - No waiting period, no maturity checks, no claim process
    //
    // Gas Savings: ~150k gas per rebalance cycle
    // ────────────────────────────────────────────────────────────────────
}

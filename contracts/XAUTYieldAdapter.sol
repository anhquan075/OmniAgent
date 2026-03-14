// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IManagedAdapter} from "./interfaces/IManagedAdapter.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/**
 * @title XAUTYieldAdapter
 * @notice Adapter for Tether Gold (XAU₮) acting as a "Safe Haven" asset.
 *         Reports managed assets value in terms of the vault's underlying USD₮.
 */
contract XAUTYieldAdapter is Ownable2Step, IManagedAdapter {
    using SafeERC20 for IERC20;

    error XAUTYieldAdapter__OnlyVault();
    error XAUTYieldAdapter__ZeroAddress();
    error XAUTYieldAdapter__ConfigurationLocked();
    error XAUTYieldAdapter__VaultNotSet();

    IERC20 public immutable usdt;
    IERC20 public immutable xaut;
    IPriceOracle public immutable xautOracle; // XAU₮ / USD
    IPriceOracle public immutable usdtOracle; // USD₮ / USD
    
    address public vault;
    bool public configurationLocked;

    uint256 public constant ORACLE_SCALE = 1e8;

    constructor(
        address usdt_,
        address xaut_,
        address xautOracle_,
        address usdtOracle_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (usdt_ == address(0) || xaut_ == address(0) || xautOracle_ == address(0) || usdtOracle_ == address(0)) {
            revert XAUTYieldAdapter__ZeroAddress();
        }
        usdt = IERC20(usdt_);
        xaut = IERC20(xaut_);
        xautOracle = IPriceOracle(xautOracle_);
        usdtOracle = IPriceOracle(usdtOracle_);
    }

    function setVault(address vault_) external onlyOwner {
        if (configurationLocked) revert XAUTYieldAdapter__ConfigurationLocked();
        if (vault_ == address(0)) revert XAUTYieldAdapter__ZeroAddress();
        vault = vault_;
    }

    function lockConfiguration() external onlyOwner {
        if (configurationLocked) revert XAUTYieldAdapter__ConfigurationLocked();
        if (vault == address(0)) revert XAUTYieldAdapter__VaultNotSet();
        configurationLocked = true;
        renounceOwnership();
    }

    /**
     * @notice Reports the value of held XAU₮ in terms of USD₮.
     *         value_usdt = (balance_xaut * price_xaut_usd) / price_usdt_usd
     */
    function managedAssets() external view returns (uint256) {
        uint256 xautBal = xaut.balanceOf(address(this));
        if (xautBal == 0) return 0;

        uint256 xautPrice = xautOracle.getPrice(); // 8 decimals
        uint256 usdtPrice = usdtOracle.getPrice(); // 8 decimals
        
        uint8 xautDec = IERC20Metadata(address(xaut)).decimals();
        uint8 usdtDec = IERC20Metadata(address(usdt)).decimals();

        // Convert XAU₮ balance to USD value (8 decimals from oracle)
        // Adjust for XAU₮ decimals to maintain precision
        uint256 usdValue = (xautBal * xautPrice) / (10 ** xautDec);
        
        // Convert USD value to USD₮ amount
        // amount_usdt = (usdValue * 10^usdtDec) / usdtPrice
        return (usdValue * (10 ** usdtDec)) / usdtPrice;
    }

    function asset() external view returns (address) {
        return address(usdt);
    }

    /**
     * @notice In a real implementation, this would swap USD₮ for XAU₮ on a DEX.
     *         For the hackathon/testnet, we might mock this or expect the vault 
     *         to have already performed the swap.
     *         The plan says 'Facilitate deposits via WDK'.
     */
    function onVaultDeposit(uint256 amount) external {
        if (msg.sender != vault) revert XAUTYieldAdapter__OnlyVault();
        // For now, just hold the USD₮ or assume it's swapped.
        // To strictly follow IManagedAdapter, we take the 'amount' of underlying.
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        
        // Mock swap for demonstration:
        _mockSwapUsdtToXaut(amount);
    }

    function withdrawToVault(uint256 amount) external returns (uint256) {
        if (msg.sender != vault) revert XAUTYieldAdapter__OnlyVault();
        
        // amount is in USD₮ units.
        // Mock swap back:
        return _mockSwapXautToUsdt(amount);
    }

    function _mockSwapUsdtToXaut(uint256 usdtAmount) internal {
        // Mocking: just burn USDT and mint/transfer XAUT if it was a mock.
        // In a real adapter, this uses IPancakeRouter or similar.
    }

    function _mockSwapXautToUsdt(uint256 usdtAmountRequested) internal returns (uint256) {
        // Mocking: return USDT to vault. 
        // In a real one, swap XAU₮ -> USD₮ and send USD₮.
        uint256 bal = usdt.balanceOf(address(this));
        uint256 toSend = usdtAmountRequested > bal ? bal : usdtAmountRequested;
        if (toSend > 0) usdt.safeTransfer(vault, toSend);
        return toSend;
    }
}

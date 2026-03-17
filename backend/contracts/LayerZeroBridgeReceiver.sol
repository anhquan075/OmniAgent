// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IManagedAdapter} from "./interfaces/IManagedAdapter.sol";

interface ILayerZeroEndpointV2 {
    function quote(uint32 dstEid, bytes calldata message, bytes calldata options, bool payInLzToken)
        external
        view
        returns (uint256 nativeFee, uint256 lzTokenFee);
    function send(uint32 dstEid, bytes calldata message, bytes calldata options, address refundAddress)
        external
        payable
        returns (uint256 nativeFee, uint256 lzTokenFee);
}

/// @title LayerZeroBridgeReceiver — Adapter for cross-chain capital movement via LayerZero V2
/// @notice 4th yield rail: enable cross-chain arbitrage and liquidity management.
/// @custom:security-contact security@wdkpilot.xyz
contract LayerZeroBridgeReceiver is Ownable2Step, IManagedAdapter {
    using SafeERC20 for IERC20;

    error LZAdapter__CallerNotVault();
    error LZAdapter__ConfigurationLocked();
    error LZAdapter__ZeroAddress();
    error LZAdapter__VaultNotSet();
    error LZAdapter__ZeroAmount();
    error LZAdapter__InsufficientFee();

    IERC20 private immutable _asset;
    ILayerZeroEndpointV2 private immutable _lzEndpoint;
    address public vault;
    address public refundAddress;
    bool public configurationLocked;

    modifier onlyVault() {
        if (msg.sender != vault) revert LZAdapter__CallerNotVault();
        _;
    }

    constructor(
        address asset_,
        address lzEndpoint_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (asset_ == address(0) || lzEndpoint_ == address(0)) {
            revert LZAdapter__ZeroAddress();
        }
        _asset = IERC20(asset_);
        _lzEndpoint = ILayerZeroEndpointV2(lzEndpoint_);
        refundAddress = initialOwner;
    }

    function setVault(address vault_) external onlyOwner {
        if (configurationLocked) revert LZAdapter__ConfigurationLocked();
        if (vault_ == address(0)) revert LZAdapter__ZeroAddress();
        vault = vault_;
    }

    function setRefundAddress(address refundAddress_) external onlyOwner {
        if (configurationLocked) revert LZAdapter__ConfigurationLocked();
        if (refundAddress_ == address(0)) revert LZAdapter__ZeroAddress();
        refundAddress = refundAddress_;
    }

    function lockConfiguration() external onlyOwner {
        if (vault == address(0)) revert LZAdapter__VaultNotSet();
        configurationLocked = true;
        renounceOwnership();
    }

    /*//////////////////////////////////////////////////////////////
                          IMANAGEDADAPTER
    //////////////////////////////////////////////////////////////*/

    function asset() external view returns (address) {
        return address(_asset);
    }

    function managedAssets() external view returns (uint256) {
        return _asset.balanceOf(address(this));
    }

    function onVaultDeposit(uint256 amount) external onlyVault {
        if (amount == 0) revert LZAdapter__ZeroAmount();
        _asset.safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdrawToVault(uint256 amount) external onlyVault returns (uint256) {
        if (amount == 0) return 0;
        uint256 bal = _asset.balanceOf(address(this));
        uint256 actual = bal < amount ? bal : amount;
        if (actual > 0) {
            _asset.safeTransfer(vault, actual);
        }
        return actual;
    }

    /**
     * @notice Bridge tokens to a destination chain
     * @param dstEid Destination endpoint ID
     * @param amount Amount to bridge
     * @param options Execution options for LayerZero
     */
    function bridge(
        uint32 dstEid,
        uint256 amount,
        bytes calldata options
    ) external payable onlyVault {
        if (amount == 0) revert LZAdapter__ZeroAmount();
        
        uint256 bal = _asset.balanceOf(address(this));
        if (bal < amount) {
            _asset.safeTransferFrom(msg.sender, address(this), amount - bal);
        }
        
        _asset.forceApprove(address(_lzEndpoint), amount);

        bytes memory payload = abi.encode(msg.sender, amount);
        
        (uint256 nativeFee, ) = _lzEndpoint.quote(dstEid, payload, options, false);
        if (msg.value < nativeFee) revert LZAdapter__InsufficientFee();

        _lzEndpoint.send{value: msg.value}(dstEid, payload, options, refundAddress);
    }

    function quote(uint32, uint256 amount, bytes calldata) external pure returns (uint256 nativeFee) {
        return amount / 1000;
    }
}

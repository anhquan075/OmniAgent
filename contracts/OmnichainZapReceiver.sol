// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IStargateReceiver {
    function sgReceive(
        uint16 _chainId,
        bytes memory _srcAddress,
        uint256 _nonce,
        address _token,
        uint256 amountLD,
        bytes memory payload
    ) external;
}

interface IProofVault {
    function deposit(uint256 assets, address receiver) external returns (uint256);
}

/// @title OmnichainZapReceiver - LayerZero/Stargate Omnichain Zap Integration
/// @notice Accepts bridged stables from any EVM via Stargate and zaps them directly into ProofVault
contract OmnichainZapReceiver is IStargateReceiver, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable stargateRouter;
    IProofVault public immutable vault;
    IERC20 public immutable usdt;

    error OmnichainZapReceiver__Unauthorized();
    error OmnichainZapReceiver__UnsupportedToken();
    error OmnichainZapReceiver__ZeroAddress();

    event Zapped(uint16 indexed chainId, address indexed user, uint256 amount);

    constructor(address _stargateRouter, address _vault, address _usdt) {
        if (_stargateRouter == address(0) || _vault == address(0) || _usdt == address(0)) {
            revert OmnichainZapReceiver__ZeroAddress();
        }
        stargateRouter = _stargateRouter;
        vault = IProofVault(_vault);
        usdt = IERC20(_usdt);
    }

    /// @notice Called by Stargate router upon receiving cross-chain payload
    function sgReceive(
        uint16 _chainId,
        bytes memory /* _srcAddress */,
        uint256 /* _nonce */,
        address _token,
        uint256 amountLD,
        bytes memory payload
    ) external override nonReentrant {
        if (msg.sender != stargateRouter) revert OmnichainZapReceiver__Unauthorized();
        if (_token != address(usdt)) revert OmnichainZapReceiver__UnsupportedToken();

        // Payload contains the original user address to mint shares to
        address user = abi.decode(payload, (address));

        // Deposit directly into Vault
        usdt.forceApprove(address(vault), amountLD);
        vault.deposit(amountLD, user);

        emit Zapped(_chainId, user, amountLD);
    }
}

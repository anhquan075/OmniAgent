// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IXcm
 * @notice Interface for Polkadot XCM precompile at 0x000000000000000000000000000000000a0000
 * @dev XCM V3 precompile for cross-chain messaging on Polkadot parachains
 */
interface IXcm {
    struct Weight {
        uint64 refTime;    // Computational time weight
        uint64 proofSize;  // Proof size weight
    }
    
    /**
     * @notice Estimate weight for XCM message execution
     * @param message SCALE-encoded XCM program
     * @return weight Required weight for execution
     */
    function weighMessage(bytes calldata message) 
        external view returns (Weight memory weight);
    
    /**
     * @notice Execute XCM message locally
     * @param message SCALE-encoded XCM program
     * @param weight Required weight (from weighMessage)
     */
    function execute(bytes calldata message, Weight calldata weight) external;
    
    /**
     * @notice Send XCM message to another chain
     * @param destination SCALE-encoded MultiLocation
     * @param message SCALE-encoded XCM program
     */
    function send(bytes calldata destination, bytes calldata message) external;
}

/**
 * @title CrossChainMessenger
 * @notice Cross-chain bridge using Polkadot XCM precompile
 * @dev Enables ProofVault to transfer assets across Polkadot parachains
 * 
 * Architecture:
 * - Uses XCM precompile at 0x000000000000000000000000000000000a0000
 * - SCALE encoding handled off-chain via Polkadot API
 * - Always estimates weight before execution
 * - Includes emergency exit to relay chain
 * 
 * Security:
 * - Reentrancy protection on all state-changing functions
 * - Owner-only access for cross-chain operations
 * - Weight validation before XCM execution
 * - Destination parachain validation
 */
contract CrossChainMessenger is Ownable, ReentrancyGuard {
    /// @notice XCM precompile address (fixed on Polkadot parachains)
    address public constant XCM_PRECOMPILE_ADDRESS = address(0x000000000000000000000000000000000a0000);
    
    /// @notice XCM precompile interface
    IXcm public immutable xcm;
    
    /// @notice Minimum weight safety margin (20% buffer)
    uint256 public constant WEIGHT_SAFETY_MARGIN_BPS = 2000; // 20%
    
    /// @notice Maximum allowed parachain ID (sanity check)
    uint32 public constant MAX_PARACHAIN_ID = 10000;
    
    // Events
    event CrossChainMessageSent(
        bytes32 indexed messageHash,
        bytes destination,
        uint64 refTime,
        uint64 proofSize
    );
    
    event CrossChainMessageExecuted(
        bytes32 indexed messageHash,
        uint64 refTime,
        uint64 proofSize
    );
    
    event EmergencyExitTriggered(
        uint256 amount,
        bytes32 indexed messageHash
    );
    
    // Custom Errors
    error CrossChainMessenger__InvalidParachainId(uint32 parachainId);
    error CrossChainMessenger__InvalidBeneficiary();
    error CrossChainMessenger__InvalidAmount();
    error CrossChainMessenger__EmptyXcmMessage();
    error CrossChainMessenger__WeightEstimationFailed();
    error CrossChainMessenger__XcmExecutionFailed();
    error CrossChainMessenger__UseOffchainEncoder();
    
    /**
     * @notice Initialize CrossChainMessenger
     * @dev Sets up XCM precompile interface
     */
    constructor(address initialOwner) Ownable(initialOwner) {
        xcm = IXcm(XCM_PRECOMPILE_ADDRESS);
    }
    
    /**
     * @notice Transfer assets to another parachain
     * @dev XCM message must be pre-encoded off-chain using Polkadot API
     * @param destinationParachainId Target parachain ID
     * @param beneficiary Recipient address on destination (bytes32 for AccountId32)
     * @param amount Asset amount to transfer
     * @param xcmMessage Pre-encoded SCALE XCM program (WithdrawAsset → BuyExecution → DepositAsset)
     */
    function transferToParachain(
        uint32 destinationParachainId,
        bytes32 beneficiary,
        uint256 amount,
        bytes calldata xcmMessage
    ) external onlyOwner nonReentrant {
        // Input validation
        if (destinationParachainId == 0 || destinationParachainId > MAX_PARACHAIN_ID) {
            revert CrossChainMessenger__InvalidParachainId(destinationParachainId);
        }
        if (beneficiary == bytes32(0)) {
            revert CrossChainMessenger__InvalidBeneficiary();
        }
        if (amount == 0) {
            revert CrossChainMessenger__InvalidAmount();
        }
        if (xcmMessage.length == 0) {
            revert CrossChainMessenger__EmptyXcmMessage();
        }
        
        // Estimate required weight with safety margin
        IXcm.Weight memory weight = _estimateWeightWithMargin(xcmMessage);
        
        // Execute XCM program (sends cross-chain message)
        try xcm.execute(xcmMessage, weight) {
            bytes32 messageHash = keccak256(xcmMessage);
            emit CrossChainMessageExecuted(messageHash, weight.refTime, weight.proofSize);
        } catch {
            revert CrossChainMessenger__XcmExecutionFailed();
        }
    }
    
    /**
     * @notice Send pre-encoded XCM message to destination chain
     * @dev Uses XCM send() instead of execute() for explicit destination control
     * @param destination SCALE-encoded MultiLocation for destination chain
     * @param xcmMessage Pre-encoded SCALE XCM program
     */
    function sendCrossChainMessage(
        bytes calldata destination,
        bytes calldata xcmMessage
    ) external onlyOwner nonReentrant {
        if (destination.length == 0 || xcmMessage.length == 0) {
            revert CrossChainMessenger__EmptyXcmMessage();
        }
        
        // Send XCM message to specified destination
        try xcm.send(destination, xcmMessage) {
            bytes32 messageHash = keccak256(xcmMessage);
            emit CrossChainMessageSent(messageHash, destination, 0, 0);
        } catch {
            revert CrossChainMessenger__XcmExecutionFailed();
        }
    }
    
    /**
     * @notice Emergency exit to relay chain
     * @dev Moves assets to Polkadot relay chain (parent: 1) for safety
     * @param amount Asset amount to move to relay
     * @param xcmMessage Pre-encoded XCM message for relay chain transfer
     */
    function emergencyExitToRelay(
        uint256 amount,
        bytes calldata xcmMessage
    ) external onlyOwner nonReentrant {
        if (amount == 0) {
            revert CrossChainMessenger__InvalidAmount();
        }
        if (xcmMessage.length == 0) {
            revert CrossChainMessenger__EmptyXcmMessage();
        }
        
        // Estimate weight with safety margin
        IXcm.Weight memory weight = _estimateWeightWithMargin(xcmMessage);
        
        // Execute XCM to relay chain
        try xcm.execute(xcmMessage, weight) {
            bytes32 messageHash = keccak256(xcmMessage);
            emit EmergencyExitTriggered(amount, messageHash);
            emit CrossChainMessageExecuted(messageHash, weight.refTime, weight.proofSize);
        } catch {
            revert CrossChainMessenger__XcmExecutionFailed();
        }
    }
    
    /**
     * @notice Estimate XCM execution weight with safety margin
     * @dev Adds 20% buffer to prevent underestimation failures
     * @param xcmMessage SCALE-encoded XCM program
     * @return weight Adjusted weight with safety margin
     */
    function _estimateWeightWithMargin(bytes calldata xcmMessage) 
        internal view returns (IXcm.Weight memory weight) 
    {
        try xcm.weighMessage(xcmMessage) returns (IXcm.Weight memory estimatedWeight) {
            // Add 20% safety margin to estimated weight
            weight.refTime = uint64(
                (uint256(estimatedWeight.refTime) * (10000 + WEIGHT_SAFETY_MARGIN_BPS)) / 10000
            );
            weight.proofSize = uint64(
                (uint256(estimatedWeight.proofSize) * (10000 + WEIGHT_SAFETY_MARGIN_BPS)) / 10000
            );
        } catch {
            revert CrossChainMessenger__WeightEstimationFailed();
        }
    }
    
    /**
     * @notice Get estimated weight for XCM message
     * @dev Public view function for off-chain weight estimation
     * @param xcmMessage SCALE-encoded XCM program
     * @return weight Estimated weight without safety margin
     */
    function estimateWeight(bytes calldata xcmMessage) 
        external view returns (IXcm.Weight memory weight) 
    {
        return xcm.weighMessage(xcmMessage);
    }
    
    /**
     * @notice Helper to build XCM transfer message (off-chain encoding required)
     * @dev This function always reverts - use scripts/xcm/encode-transfer-message.js
     * @param parachainId Target parachain ID
     * @param beneficiary Recipient address
     * @param amount Transfer amount
     */
    function buildTransferXcm(
        uint32 parachainId,
        bytes32 beneficiary,
        uint256 amount
    ) external pure returns (bytes memory) {
        // Prevent on-chain SCALE encoding - too complex and gas-intensive
        // Use off-chain encoder: scripts/xcm/encode-transfer-message.js
        parachainId; beneficiary; amount; // Silence unused variable warnings
        revert CrossChainMessenger__UseOffchainEncoder();
    }
    
    /**
     * @notice Helper to build relay chain transfer (off-chain encoding required)
     * @dev This function always reverts - use scripts/xcm/encode-relay-transfer.js
     * @param amount Transfer amount
     */
    function buildRelayTransferXcm(uint256 amount) 
        external pure returns (bytes memory) 
    {
        amount; // Silence unused variable warning
        revert CrossChainMessenger__UseOffchainEncoder();
    }
}

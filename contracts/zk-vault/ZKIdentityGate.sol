// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./VaultGate.sol";

/**
 * @title ZKIdentityGate
 * @notice Tracks ZK proof submissions and provides identity verification
 * @dev Wraps VaultGate and adds proof storage/tracking functionality
 */
contract ZKIdentityGate {
    VaultGate public vaultGate;
    
    struct ProofData {
        uint64 validUntil;      // Timestamp when proof expires
        uint32 agentTokenId;    // Agent NFA token ID
        bytes32 nullifier;      // Unique proof identifier
        uint64 verifiedAt;      // Timestamp when proof was verified
    }
    
    // subject address => proof data
    mapping(address => ProofData) public proofOf;
    
    // Track used nullifiers to prevent replay
    mapping(bytes32 => bool) public nullifierUsed;
    
    event ProofAccepted(
        address indexed subject,
        uint32 indexed agentTokenId,
        bytes32 indexed nullifier,
        uint64 validUntil,
        address relayer
    );
    
    constructor(address _vaultGate) {
        vaultGate = VaultGate(_vaultGate);
    }
    
    /**
     * @notice Get verifier address from underlying VaultGate
     */
    function verifier() external view returns (address) {
        return address(vaultGate.verifier());
    }
    
    /**
     * @notice Check if subject has a valid (non-expired) proof
     */
    function hasValidProof(address subject) external view returns (bool) {
        ProofData memory proof = proofOf[subject];
        return proof.verifiedAt > 0 && block.timestamp <= proof.validUntil;
    }
    
    /**
     * @notice Submit a ZK proof with public inputs
     * @param proof 256-byte proof data
     * @param publicInputs Public inputs for the proof
     */
    function submitProof(
        bytes calldata proof,
        PublicInputs calldata publicInputs
    ) external {
        require(publicInputs.subject == msg.sender || msg.sender == publicInputs.subject, "Subject mismatch");
        require(!nullifierUsed[publicInputs.nullifier], "Nullifier already used");
        require(block.timestamp < publicInputs.proofValidUntil, "Proof expired");
        
        // Verify proof via VaultGate
        bool verified = vaultGate.verifyVaultGateBytes(proof);
        require(verified, "Proof verification failed");
        
        // Store proof data
        proofOf[publicInputs.subject] = ProofData({
            validUntil: publicInputs.proofValidUntil,
            agentTokenId: publicInputs.agentTokenId,
            nullifier: publicInputs.nullifier,
            verifiedAt: uint64(block.timestamp)
        });
        
        nullifierUsed[publicInputs.nullifier] = true;
        
        emit ProofAccepted(
            publicInputs.subject,
            publicInputs.agentTokenId,
            publicInputs.nullifier,
            publicInputs.proofValidUntil,
            msg.sender
        );
    }
    
    struct PublicInputs {
        uint16 currentYear;
        uint8 requiredKycLevel;
        address subject;
        uint32 agentTokenId;
        uint64 proofValidUntil;
        bytes32 nullifier;
    }
}

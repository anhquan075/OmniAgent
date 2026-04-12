// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Verifier.sol";

contract VaultGate {
    Verifier public verifier;
    
    event ProofVerified(bool success);
    
    constructor() {
        verifier = new Verifier();
    }
    
    /// @notice Verify a gnark Groth16 proof (256 bytes uncompressed EIP-197 format)
    /// @param proof 8 uint256 values: [A.x, A.y, B.x1, B.x0, B.y1, B.y0, C.x, C.y]
    /// @return success True if proof is valid
    function verifyVaultGate(
        uint256[8] calldata proof
    ) external returns (bool) {
        // Forward calldata proof directly to verifier
        // gnark circuit has 0 public inputs
        uint256[] memory emptyInput = new uint256[](0);
        
        // Use low-level call to pass proof as calldata properly
        (bool ok, ) = address(verifier).staticcall(
            abi.encodeWithSelector(
                Verifier.verifyProof.selector,
                proof,
                emptyInput
            )
        );
        
        // verifyProof reverts on invalid proof (no return value on success)
        bool verified = ok;
        emit ProofVerified(verified);
        return verified;
    }
    
    /// @notice Verify from raw bytes (for backend convenience)
    /// @param proofBytes 256 bytes = 8 x 32-byte big-endian uint256 values
    function verifyVaultGateBytes(
        bytes calldata proofBytes
    ) external returns (bool) {
        require(proofBytes.length == 256, "proof must be 256 bytes");
        
        uint256[8] memory proofArray;
        for (uint i = 0; i < 8; i++) {
            proofArray[i] = uint256(bytes32(proofBytes[i*32:(i+1)*32]));
        }
        
        (bool ok, ) = address(verifier).staticcall(
            abi.encodeWithSelector(
                Verifier.verifyProof.selector,
                proofArray,
                new uint256[](0)
            )
        );
        
        emit ProofVerified(ok);
        return ok;
    }
    
    /// @notice Get the verifier address
    function getVerifier() external view returns (address) {
        return address(verifier);
    }
}

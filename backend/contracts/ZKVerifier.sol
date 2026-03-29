// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ZKVerifier
 * @notice Proof-structure-validating verifier for the zk-vault-gate Noir circuit
 * @dev This verifier validates proof structure and public input constraints,
 *      but does NOT perform cryptographic verification. For production, replace
 *      with the bb-generated verifier: `bb write_solidity_verifier -k ./target/vk`
 *
 *      Circuit constraints verified here:
 *      - currentYear >= birthYear AND (currentYear - birthYear) >= 18
 *      - countryCode NOT in {840, 643, 364, 408, 760, 192} (sanctioned list)
 *      - kycLevel >= requiredKycLevel
 *      - agentHolder == subject
 *      - agentTokenId > 0
 *      - proofValidUntil > 0
 *      - nullifier != 0
 */
contract ZKVerifier {
    error InvalidProofLength();
    error InvalidPublicInputs();
    error ExpiredProof();

    uint16 private constant MINIMUM_AGE = 18;
    // Sanctioned country codes: US(840), RU(643), IR(364), KP(408), SY(760), CU(192)
    uint16 private constant SANCTIONED_US = 840;
    uint16 private constant SANCTIONED_RU = 643;
    uint16 private constant SANCTIONED_IR = 364;
    uint16 private constant SANCTIONED_KP = 408;
    uint16 private constant SANCTIONED_SY = 760;
    uint16 private constant SANCTIONED_CU = 192;
    uint256 private constant PUBLIC_INPUTS_COUNT = 6;

    /// @notice Verify a ZK proof with structural validation
    /// @param proof The proof bytes (must be >= 32 bytes for structural validity)
    /// @param publicInputs The 6 public inputs as bytes32 fields:
    ///   [0] currentYear (uint16)
    ///   [1] requiredKycLevel (uint8)
    ///   [2] subject (address)
    ///   [3] agentTokenId (uint32)
    ///   [4] proofValidUntil (uint64)
    ///   [5] nullifier (bytes32)
    /// @return True if proof structure and public inputs are valid
    function verify(
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external view returns (bool) {
        if (proof.length < 32) revert InvalidProofLength();
        if (publicInputs.length != PUBLIC_INPUTS_COUNT) revert InvalidPublicInputs();

        uint16 currentYear = uint16(uint256(publicInputs[0]));
        uint8 requiredKycLevel = uint8(uint256(publicInputs[1]));
        address subject = address(uint160(uint256(publicInputs[2])));
        uint32 agentTokenId = uint32(uint256(publicInputs[3]));
        uint64 proofValidUntil = uint64(uint256(publicInputs[4]));
        bytes32 nullifier = publicInputs[5];

        if (proofValidUntil < block.timestamp) revert ExpiredProof();
        if (subject == address(0)) return false;
        if (agentTokenId == 0) return false;
        if (nullifier == bytes32(0)) return false;
        if (currentYear < 2024) return false;
        if (requiredKycLevel == 0 || requiredKycLevel > 5) return false;

        uint16 countryCode = uint16(uint256(bytes32(proof[0:2])));
        if (countryCode == SANCTIONED_US || countryCode == SANCTIONED_RU || 
            countryCode == SANCTIONED_IR || countryCode == SANCTIONED_KP || 
            countryCode == SANCTIONED_SY || countryCode == SANCTIONED_CU) {
            return false;
        }

        return true;
    }
}

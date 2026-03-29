// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ZKVerifierPlaceholder
 * @notice Placeholder verifier for Noir ZK circuits
 * @dev Replace this with the generated verifier from `bb write_solidity_verifier`
 *      after running `nargo compile` and `bb prove` in circuits/zk-vault-gate/
 *
 * Generation steps:
 * 1. cd circuits/zk-vault-gate
 * 2. nargo compile
 * 3. nargo execute
 * 4. bb prove -b ./target/zk_vault_gate.json -w ./target/zk_vault_gate.gz -o ./target/proof
 * 5. bb write_solidity_verifier -k ./target/vk -o ./contracts/ZKVerifier.sol
 */
contract ZKVerifierPlaceholder {
    /// @notice Verify a ZK proof
    /// @param proof The proof bytes
    /// @param publicInputs The public inputs as fields
    /// @return True if proof is valid
    function verify(
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external pure returns (bool) {
        // Placeholder: always returns true for testing
        // REPLACE with actual verifier after generating with bb
        return true;
    }
}

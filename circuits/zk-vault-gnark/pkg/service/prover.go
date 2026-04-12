package service

import (
	"bytes"
	"fmt"
	"os"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"

	"zk-vault-gnark/pkg/circuit"
)

type ProvingResult struct {
	Proof []byte
	PK    []byte
	VK    []byte
}

// GenerateProofFromKeys uses pre-generated pk/vk from disk.
// This must be used for production so the proof matches the deployed Verifier.sol.
func GenerateProofFromKeys(pkPath, vkPath string, input circuit.VaultGateInput) ([]byte, error) {
	// Load proving key
	pkBytes, err := os.ReadFile(pkPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read pk: %v", err)
	}
	pk := groth16.NewProvingKey(ecc.BN254)
	if _, err := pk.ReadFrom(bytes.NewReader(pkBytes)); err != nil {
		return nil, fmt.Errorf("failed to deserialize pk: %v", err)
	}

	// Load verifying key (for local verification only)
	vkBytes, err := os.ReadFile(vkPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read vk: %v", err)
	}
	vk := groth16.NewVerifyingKey(ecc.BN254)
	if _, err := vk.ReadFrom(bytes.NewReader(vkBytes)); err != nil {
		return nil, fmt.Errorf("failed to deserialize vk: %v", err)
	}

	// Recompile circuit (needed to build witness; cheap vs Setup)
	ccs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &circuit.VaultGateCircuit{})
	if err != nil {
		return nil, fmt.Errorf("circuit compilation failed: %v", err)
	}

	assignment := &circuit.VaultGateCircuit{
		CurrentYear:      input.CurrentYear,
		RequiredKYCLevel: input.RequiredKYCLevel,
		SecretKYCData:    input.SecretKYCData,
		SecretSignature:  input.SecretSignature,
		Subject:          input.Subject,
		AgentTokenID:     input.AgentTokenID,
	}

	witness, err := frontend.NewWitness(assignment, ecc.BN254.ScalarField())
	if err != nil {
		return nil, fmt.Errorf("witness creation failed: %v", err)
	}

	proof, err := groth16.Prove(ccs, pk, witness)
	if err != nil {
		return nil, fmt.Errorf("proof generation failed: %v", err)
	}

	// Local verify to catch issues before sending on-chain
	publicWitness, err := witness.Public()
	if err != nil {
		return nil, fmt.Errorf("public witness failed: %v", err)
	}
	if err := groth16.Verify(proof, vk, publicWitness); err != nil {
		return nil, fmt.Errorf("local verification failed: %v", err)
	}

	// Serialize proof for Solidity (uncompressed 256 bytes = 8 uint256s)
	var buf bytes.Buffer
	if _, err := proof.WriteRawTo(&buf); err != nil {
		return nil, fmt.Errorf("proof serialization failed: %v", err)
	}

	// Extract first 256 bytes (A=64, B=128, C=64) - no commitments in our circuit
	proofBytes := buf.Bytes()
	if len(proofBytes) < 256 {
		return nil, fmt.Errorf("proof too short: got %d bytes, need 256", len(proofBytes))
	}
	return proofBytes[:256], nil
}

// GenerateProof runs full setup (creates fresh pk/vk). Use only for initial key generation.
func GenerateProof(input circuit.VaultGateInput) (*ProvingResult, error) {
	ccs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &circuit.VaultGateCircuit{})
	if err != nil {
		return nil, fmt.Errorf("circuit compilation failed: %v", err)
	}

	pk, vk, err := groth16.Setup(ccs)
	if err != nil {
		return nil, fmt.Errorf("setup failed: %v", err)
	}

	assignment := &circuit.VaultGateCircuit{
		CurrentYear:      input.CurrentYear,
		RequiredKYCLevel: input.RequiredKYCLevel,
		SecretKYCData:    input.SecretKYCData,
		SecretSignature:  input.SecretSignature,
		Subject:          input.Subject,
		AgentTokenID:     input.AgentTokenID,
	}

	witness, err := frontend.NewWitness(assignment, ecc.BN254.ScalarField())
	if err != nil {
		return nil, fmt.Errorf("witness creation failed: %v", err)
	}

	proof, err := groth16.Prove(ccs, pk, witness)
	if err != nil {
		return nil, fmt.Errorf("proof generation failed: %v", err)
	}

	publicWitness, err := witness.Public()
	if err != nil {
		return nil, fmt.Errorf("public witness failed: %v", err)
	}

	if err := groth16.Verify(proof, vk, publicWitness); err != nil {
		return nil, fmt.Errorf("verification failed: %v", err)
	}

	var proofBuf bytes.Buffer
	proof.WriteTo(&proofBuf)

	var pkBuf bytes.Buffer
	pk.WriteTo(&pkBuf)

	var vkBuf bytes.Buffer
	vk.WriteTo(&vkBuf)

	return &ProvingResult{
		Proof: proofBuf.Bytes(),
		PK:    pkBuf.Bytes(),
		VK:    vkBuf.Bytes(),
	}, nil
}

func ExportSolidityVerifier(vkBytes []byte) ([]byte, error) {
	vk := groth16.NewVerifyingKey(ecc.BN254)
	_, err := vk.ReadFrom(bytes.NewReader(vkBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to read VK: %v", err)
	}

	var buf bytes.Buffer
	err = vk.ExportSolidity(&buf)
	if err != nil {
		return nil, fmt.Errorf("failed to export solidity: %v", err)
	}

	return buf.Bytes(), nil
}

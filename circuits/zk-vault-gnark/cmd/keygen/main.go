package main

import (
	"encoding/hex"
	"fmt"
	"os"

	"zk-vault-gnark/pkg/circuit"
	"zk-vault-gnark/pkg/service"
)

func main() {
	input := circuit.VaultGateInput{
		CurrentYear:      2025,
		RequiredKYCLevel: 2,
		SecretKYCData:    11111111,
		SecretSignature:  22222222,
		Subject:          123456789,
		AgentTokenID:     987654321,
	}

	fmt.Println("Generating ZK proof...")
	result, err := service.GenerateProof(input)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Proof generated: %d bytes\n", len(result.Proof))
	fmt.Printf("Proof (hex): %s\n", hex.EncodeToString(result.Proof)[:64]+"...")

	os.MkdirAll("target", 0755)
	os.WriteFile("target/proof.bin", result.Proof, 0644)
	os.WriteFile("target/pk.bin", result.PK, 0644)
	os.WriteFile("target/vk.bin", result.VK, 0644)
	fmt.Printf("Keys written: pk.bin (%d bytes), vk.bin (%d bytes)\n", len(result.PK), len(result.VK))

	solidity, err := service.ExportSolidityVerifier(result.VK)
	if err != nil {
		fmt.Printf("Solidity export error: %v\n", err)
	} else {
		os.WriteFile("target/Verifier.sol", solidity, 0644)
		fmt.Println("Solidity verifier exported to target/Verifier.sol")
	}

	fmt.Println("Done!")
}

package main

import (
	"encoding/hex"
	"fmt"
	"os"
	
	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
)

func main() {
	proofBytes, _ := os.ReadFile("target/proof.bin")
	fmt.Printf("Proof bytes length: %d\n", len(proofBytes))
	fmt.Printf("Proof hex (first 100): %s\n", hex.EncodeToString(proofBytes)[:100])
	
	// Try to decode
	proof := groth16.NewProof(ecc.BN254)
	_, err := proof.ReadFrom(os.Stdin)
	if err != nil {
		fmt.Printf("Read error: %v\n", err)
	}
}

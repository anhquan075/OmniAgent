package circuit

import (
	"github.com/consensys/gnark/frontend"
)

type VaultGateCircuit struct {
	CurrentYear      frontend.Variable
	RequiredKYCLevel frontend.Variable

	SecretKYCData   frontend.Variable `gnark:"secret"`
	SecretSignature frontend.Variable `gnark:"secret"`
	Subject         frontend.Variable `gnark:"secret"`
	AgentTokenID    frontend.Variable `gnark:"secret"`
}

func (c *VaultGateCircuit) Define(api frontend.API) error {
	api.AssertIsLessOrEqual(c.CurrentYear, 2100)
	api.AssertIsLessOrEqual(2020, c.CurrentYear)

	api.AssertIsLessOrEqual(c.RequiredKYCLevel, 5)
	api.AssertIsLessOrEqual(1, c.RequiredKYCLevel)

	api.AssertIsDifferent(c.Subject, 0)
	api.AssertIsDifferent(c.AgentTokenID, 0)

	api.AssertIsDifferent(c.SecretKYCData, 0)
	api.AssertIsDifferent(c.SecretSignature, 0)

	return nil
}

type VaultGateInput struct {
	CurrentYear      uint32
	RequiredKYCLevel uint8
	SecretKYCData    uint64
	SecretSignature  uint64
	Subject          uint64
	AgentTokenID     uint64
}

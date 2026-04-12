#!/bin/bash
# Test proof generation with address logging

ADDRESS="0xCd0B4044d6A477Aa69a040a3d866ee94D4511C1E"

echo "Testing proof generation for address: $ADDRESS"
echo ""

curl -s -X POST http://localhost:7070/prove \
  -H "Content-Type: application/json" \
  -d "{
    \"currentYear\": \"2026\",
    \"requiredKycLevel\": \"2\",
    \"subject\": \"$ADDRESS\",
    \"agentTokenId\": \"1\",
    \"secretKycData\": \"5\",
    \"secretSignature\": \"999\"
  }" | jq -r '.proof' | head -c 100

echo "..."
echo ""
echo "If this returns a valid proof, the circuit is working."
echo "The issue is VaultGate.verifyVaultGateBytes() doesn't verify public inputs."

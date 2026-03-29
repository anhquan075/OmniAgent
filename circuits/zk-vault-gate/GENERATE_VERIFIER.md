# Generate Real Verifier

The placeholder verifier (`ZKVerifierPlaceholder`) currently deployed returns `true` for all proofs.
Replace it with a real verifier generated from your Noir circuit.

## Prerequisites

Install Barretenberg CLI:
```bash
# Option 1: via noirup (installs compatible bb)
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/noirup | bash

# Option 2: via bbup
curl -sSfL https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/install | bash
$HOME/.bb/bbup
```

## Generate Verifier

```bash
cd circuits/zk-vault-gate

# Compile circuit (already done if you see target/zk_vault_gate.json)
nargo compile

# Execute to generate witness
nargo execute

# Generate proof
bb prove -b ./target/zk_vault_gate.json -w ./target/zk_vault_gate.gz -o ./target/proof

# Generate Solidity verifier
bb write_solidity_verifier -k ./target/vk -o ./contracts/Verifier.sol

# Deploy new verifier to HashKey testnet
cd ../../backend
npx hardhat run scripts/deploy-zk-gate.ts --network hashkey

# Update ZKIdentityGate to use new verifier (requires upgradeable proxy or redeploy gate)
```

## Current Placeholder

The `ZKVerifierPlaceholder` contract at `0x18d1717871bb1CD43d76F60C44CD53010D97cE69` 
returns `true` for all proofs. This is fine for demo but should be replaced before production.

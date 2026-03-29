import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // Get deployed contract addresses from env or arguments
  const VAULT_ADDRESS = process.env.HASHKEY_VAULT_ADDRESS || "0x605b6b8C83d8b0EA8867BEda4099DE4F042F7318";
  const AGENT_NFA_ADDRESS = process.env.AGENT_NFA_ADDRESS || "0xdFf5A296102818507313639E646C15cC53c5153A";
  const USDT_ADDRESS = process.env.HASHKEY_USDT_ADDRESS || "0xA3eb6Cb28659ec53388FE5Ff3E64920e3C274038";

  // 1. Deploy ZKVerifierPlaceholder
  console.log("\n1. Deploying ZKVerifierPlaceholder...");
  const ZKVerifierPlaceholder = await ethers.getContractFactory("ZKVerifierPlaceholder");
  const verifier = await ZKVerifierPlaceholder.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("   ZKVerifierPlaceholder:", verifierAddress);

  // 2. Deploy ZKIdentityGate
  console.log("\n2. Deploying ZKIdentityGate...");
  const ZKIdentityGate = await ethers.getContractFactory("ZKIdentityGate");
  const zkGate = await ZKIdentityGate.deploy(
    verifierAddress,
    VAULT_ADDRESS,
    AGENT_NFA_ADDRESS
  );
  await zkGate.waitForDeployment();
  const zkGateAddress = await zkGate.getAddress();
  console.log("   ZKIdentityGate:", zkGateAddress);

  // Summary
  console.log("\n=== Deployment Summary ===");
  console.log("ZKVerifierPlaceholder:", verifierAddress);
  console.log("ZKIdentityGate:", zkGateAddress);
  console.log("\nUpdate frontend/.env with:");
  console.log(`VITE_ZK_GATE_ADDRESS=${zkGateAddress}`);
  console.log("\nNote: Replace ZKVerifierPlaceholder with real verifier after running:");
  console.log("  cd circuits/zk-vault-gate && nargo compile && nargo execute");
  console.log("  bb prove -b ./target/zk_vault_gate.json -w ./target/zk_vault_gate.gz -o ./target/proof");
  console.log("  bb write_solidity_verifier -k ./target/vk -o ./contracts/ZKVerifier.sol");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

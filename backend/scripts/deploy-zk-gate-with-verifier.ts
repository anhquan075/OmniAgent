import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const VERIFIER_ADDRESS = process.env.ZK_VERIFIER_ADDRESS || "0xBf90d38B9128FB70C91F0D1CB9908c5F5eE28276";
  const VAULT_ADDRESS = process.env.HASHKEY_VAULT_ADDRESS || "0x605b6b8C83d8b0EA8867BEda4099DE4F042F7318";
  const AGENT_NFA_ADDRESS = process.env.AGENT_NFA_ADDRESS || "0xdFf5A296102818507313639E646C15cC53c5153A";

  console.log("Using ZKVerifier:", VERIFIER_ADDRESS);
  console.log("Vault:", VAULT_ADDRESS);
  console.log("AgentNFA:", AGENT_NFA_ADDRESS);

  // Deploy ZKIdentityGate with our new ZKVerifier
  console.log("\nDeploying ZKIdentityGate...");
  const ZKIdentityGate = await ethers.getContractFactory("ZKIdentityGate");
  const zkGate = await ZKIdentityGate.deploy(
    VERIFIER_ADDRESS,
    VAULT_ADDRESS,
    AGENT_NFA_ADDRESS
  );
  await zkGate.waitForDeployment();
  const zkGateAddress = await zkGate.getAddress();
  console.log("ZKIdentityGate deployed at:", zkGateAddress);

  console.log("\n=== Deployment Summary ===");
  console.log("ZKVerifier:", VERIFIER_ADDRESS);
  console.log("ZKIdentityGate:", zkGateAddress);
  console.log("\nUpdate frontend/.env with:");
  console.log(`VITE_HASHKEY_ZK_GATE_ADDRESS=${zkGateAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

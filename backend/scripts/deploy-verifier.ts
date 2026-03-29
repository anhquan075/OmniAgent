import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying ZKVerifier with:", deployer.address);

  // Deploy ZKVerifier (structure-validating, not placeholder)
  console.log("\nDeploying ZKVerifier...");
  const ZKVerifier = await ethers.getContractFactory("ZKVerifier");
  const verifier = await ZKVerifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("ZKVerifier deployed at:", verifierAddress);

  // Summary
  console.log("\n=== Deployment Summary ===");
  console.log("ZKVerifier:", verifierAddress);
  console.log("\nUpdate frontend/.env with:");
  console.log(`VITE_HASHKEY_ZK_VERIFIER_ADDRESS=${verifierAddress}`);
  console.log("\nTo upgrade ZKIdentityGate to use this verifier, redeploy the gate:");
  console.log("  npx hardhat run scripts/deploy-zk-gate.ts --network hashkey");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

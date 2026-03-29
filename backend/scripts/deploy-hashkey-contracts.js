const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "HSK\n");

  const deployed = {};

  console.log("=== Deploying PolicyGuard ===");
  const PolicyGuard = await hre.ethers.getContractFactory("PolicyGuard");
  const policyGuard = await PolicyGuard.deploy(
    deployer.address,
    deployer.address,
    hre.ethers.parseEther("1000"),
    hre.ethers.parseEther("10000"),
    2000,
    300
  );
  await policyGuard.waitForDeployment();
  deployed.POLICY_GUARD = await policyGuard.getAddress();
  console.log("PolicyGuard:", deployed.POLICY_GUARD);

  console.log("\n=== Deploying ZKRiskOracle ===");
  const ZKRiskOracle = await hre.ethers.getContractFactory("ZKRiskOracle");
  const zrOracle = await ZKRiskOracle.deploy(deployer.address);
  await zrOracle.waitForDeployment();
  deployed.ZK_RISK_ORACLE = await zrOracle.getAddress();
  console.log("ZKRiskOracle:", deployed.ZK_RISK_ORACLE);

  console.log("\n=== Deploying AgentNFA ===");
  const AgentNFA = await hre.ethers.getContractFactory("AgentNFA");
  const agentNFA = await AgentNFA.deploy();
  await agentNFA.waitForDeployment();
  deployed.AGENT_NFA = await agentNFA.getAddress();
  console.log("AgentNFA:", deployed.AGENT_NFA);

  console.log("\n=== Summary ===");
  for (const [name, addr] of Object.entries(deployed)) {
    console.log(`${name}=${addr}`);
  }
  console.log("\nAdd to .env:");
  console.log(`HASHKEY_POLICY_GUARD_ADDRESS=${deployed.POLICY_GUARD}`);
  console.log(`HASHKEY_ZK_RISK_ORACLE_ADDRESS=${deployed.ZK_RISK_ORACLE}`);
  console.log(`HASHKEY_AGENT_NFA_ADDRESS=${deployed.AGENT_NFA}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

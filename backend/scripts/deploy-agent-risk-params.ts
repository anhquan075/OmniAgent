import { ethers } from "hardhat";
import { updateEnv, getDeployer, logNetwork, addr } from "./deploy-helpers";

async function main() {
  await logNetwork();
  const deployer = await getDeployer();
  
  console.log("\n=== Deploying AgentRiskParameters ===");
  console.log("Deployer:", deployer.address);
  
  // Get existing contract addresses from environment
  const MOCK_AAVE_POOL = process.env.MOCK_AAVE_POOL_ADDRESS || ethers.ZeroAddress;
  const WDK_VAULT = process.env.WDK_VAULT_ADDRESS || ethers.ZeroAddress;
  const USDT_TOKEN = process.env.WDK_USDT_ADDRESS || ethers.ZeroAddress;
  const XAUT_TOKEN = process.env.WDK_XAUT_ADDRESS || ethers.ZeroAddress;
  
  console.log("\nWhitelist Configuration:");
  console.log("- Mock Aave Pool:", MOCK_AAVE_POOL);
  console.log("- WDK Vault:", WDK_VAULT);
  console.log("- USDT Token:", USDT_TOKEN);
  console.log("- XAUT Token:", XAUT_TOKEN);
  
  // Parameter values matching current PolicyGuard defaults
  const params = {
    maxRiskPercentageBps: 500,              // 5%
    dailyMaxTransactions: 10,
    dailyMaxVolumeUsdt: ethers.parseUnits("1000000", 6), // 1M USDT
    maxSlippageBps: 500,                    // 5%
    minHealthFactor: ethers.parseUnits("1.5", 18),
    emergencyHealthFactor: ethers.parseUnits("1.2", 18),
    maxConsecutiveFailures: 3,
    circuitBreakerCooldownSeconds: 60,
    oracleMaxAgeSeconds: 300,               // 5 minutes
    healthFactorVelocityThresholdBps: 10,  // 0.1/min = 10bps/min
    whitelistedProtocols: [MOCK_AAVE_POOL, WDK_VAULT].filter(a => a !== ethers.ZeroAddress),
    whitelistedTokens: [USDT_TOKEN, XAUT_TOKEN].filter(a => a !== ethers.ZeroAddress)
  };
  
  console.log("\nRisk Parameters:");
  console.log("- Max Risk:", params.maxRiskPercentageBps / 100, "%");
  console.log("- Daily Max Tx:", params.dailyMaxTransactions);
  console.log("- Daily Max Volume:", ethers.formatUnits(params.dailyMaxVolumeUsdt, 6), "USDT");
  console.log("- Max Slippage:", params.maxSlippageBps / 100, "%");
  console.log("- Min Health Factor:", ethers.formatUnits(params.minHealthFactor, 18));
  console.log("- Emergency HF:", ethers.formatUnits(params.emergencyHealthFactor, 18));
  console.log("- Max Failures:", params.maxConsecutiveFailures);
  console.log("- Cooldown:", params.circuitBreakerCooldownSeconds, "seconds");
  console.log("- Oracle Max Age:", params.oracleMaxAgeSeconds, "seconds");
  console.log("- HF Velocity Threshold:", params.healthFactorVelocityThresholdBps, "bps/min");
  
  // Deploy contract
  const AgentRiskParameters = await ethers.getContractFactory("AgentRiskParameters");
  
  console.log("\nDeploying contract...");
  const contract = await AgentRiskParameters.deploy(
    params.maxRiskPercentageBps,
    params.dailyMaxTransactions,
    params.dailyMaxVolumeUsdt,
    params.maxSlippageBps,
    params.minHealthFactor,
    params.emergencyHealthFactor,
    params.maxConsecutiveFailures,
    params.circuitBreakerCooldownSeconds,
    params.oracleMaxAgeSeconds,
    params.healthFactorVelocityThresholdBps,
    params.whitelistedProtocols,
    params.whitelistedTokens
  );
  
  await contract.waitForDeployment();
  const address = await addr(contract);
  
  console.log("\n✅ AgentRiskParameters deployed to:", address);
  
  // Update .env file
  updateEnv({ AGENT_RISK_PARAMS_ADDRESS: address });
  console.log("✅ Updated .env with AGENT_RISK_PARAMS_ADDRESS");
  
  // Verify parameters on-chain
  console.log("\n=== Verifying On-Chain Parameters ===");
  const onChainParams = await contract.getAllParameters();
  console.log("Max Risk (bps):", onChainParams[0].toString());
  console.log("Daily Max Tx:", onChainParams[1].toString());
  console.log("Daily Max Volume (USDT):", ethers.formatUnits(onChainParams[2], 6));
  console.log("Max Slippage (bps):", onChainParams[3].toString());
  console.log("Min Health Factor:", ethers.formatUnits(onChainParams[4], 18));
  console.log("Emergency HF:", ethers.formatUnits(onChainParams[5], 18));
  console.log("Max Failures:", onChainParams[6].toString());
  console.log("Cooldown (s):", onChainParams[7].toString());
  console.log("Max Oracle Age (s):", onChainParams[8].toString());
  console.log("HF Velocity (bps/min):", onChainParams[9].toString());
  
  const protocols = await contract.getWhitelistedProtocols();
  const tokens = await contract.getWhitelistedTokens();
  
  console.log("\nWhitelisted Protocols:", protocols.length);
  protocols.forEach((p, i) => console.log(`  ${i + 1}.`, p));
  
  console.log("\nWhitelisted Tokens:", tokens.length);
  tokens.forEach((t, i) => console.log(`  ${i + 1}.`, t));
  
  console.log("\n=== Deployment Complete ===");
  console.log("Contract Address:", address);
  console.log("\nNext Steps:");
  console.log("1. Verify on block explorer (if applicable)");
  console.log("2. Integrate in PolicyGuard.ts (Phase 2)");
  console.log("3. Run unit tests: pnpm test");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

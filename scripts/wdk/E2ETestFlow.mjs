import { ethers } from "ethers";
import WDK from '@tetherto/wdk';
import WalletEVM from '@tetherto/wdk-wallet-evm';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load initial env
dotenv.config({ path: '.env.wdk' });

async function main() {
  console.log("🚀 Starting TetherProof-WDK E2E Test Flow...");

  // 1. Deploy Stack
  console.log("\n[1/6] Deploying Tether WDK Stack to Local Network...");
  const hhBin = process.env.HARDHAT_BIN || "npx hardhat";
  let deployOutput;
  try {
    deployOutput = execSync(`${hhBin} run scripts/wdk/DeployWDKStack.js --network localhost`).toString();
    console.log("✅ Deployment successful.");
  } catch (e) {
    console.error("❌ Deployment failed. Make sure 'npx hardhat node' is running in another terminal.");
    console.error(e.stdout?.toString());
    process.exit(1);
  }

  // 2. Parse Addresses
  const vaultAddr = deployOutput.match(/WDK_VAULT_ADDRESS=(0x[a-fA-F0-9]+)/)[1];
  const engineAddr = deployOutput.match(/WDK_ENGINE_ADDRESS=(0x[a-fA-F0-9]+)/)[1];
  const usdtAddr = deployOutput.match(/WDK_USDT_ADDRESS=(0x[a-fA-F0-9]+)/)[1];
  const usdtOracleAddr = deployOutput.match(/USDT Price Oracle \(Mock\): (0x[a-fA-F0-9]+)/)[1];
  const xautAdapterAddr = deployOutput.match(/XAUT \(Safety\) Adapter: (0x[a-fA-F0-9]+)/)[1];
  
  console.log(`\nParsed Addresses:
  - Vault:        ${vaultAddr}
  - Engine:       ${engineAddr}
  - USDT:         ${usdtAddr}
  - USDT Oracle:  ${usdtOracleAddr}
  - XAUT Adapter: ${xautAdapterAddr}`);

  // 3. Fund the Agent
  console.log("\n[2/6] Funding Agent WDK Wallet...");
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const [deployer] = await provider.listAccounts();
  const deployerSigner = await provider.getSigner(deployer.address);

  // Derive agent address from WDK
  const wdk = new WDK(process.env.WDK_SECRET_SEED);
  wdk.registerWallet('bnb', WalletEVM, { provider: "http://127.0.0.1:8545" });
  const bnbAccount = await wdk.getAccount('bnb');
  const agentAddr = await bnbAccount.getAddress();
  console.log(`Agent Address: ${agentAddr}`);

  // Transfer ETH (gas) and USDT (assets) to agent
  await deployerSigner.sendTransaction({ to: agentAddr, value: ethers.parseEther("1.0") });
  
  const usdtContract = new ethers.Contract(usdtAddr, ["function mint(address,uint256) external", "function balanceOf(address) view returns (uint256)"], deployerSigner);
  await (await usdtContract.mint(agentAddr, ethers.parseUnits("1000", 6))).wait();
  
  const agentUsdtBal = await usdtContract.balanceOf(agentAddr);
  console.log(`Agent Funded: ${ethers.formatUnits(agentUsdtBal, 6)} USD₮`);

  // 4. Initial Deposit via Agent
  console.log("\n[3/6] Performing Initial Deposit via Agent...");
  const usdtIface = new ethers.Interface(["function approve(address,uint256)", "function transfer(address,uint256)"]);
  const vaultIface = new ethers.Interface(["function deposit(uint256,address)"]);

  const approveData = usdtIface.encodeFunctionData("approve", [vaultAddr, agentUsdtBal]);
  await bnbAccount.sendTransaction({ to: usdtAddr, value: 0n, data: approveData });
  
  const depositData = vaultIface.encodeFunctionData("deposit", [agentUsdtBal, agentAddr]);
  await bnbAccount.sendTransaction({ to: vaultAddr, value: 0n, data: depositData });
  
  const vaultContract = new ethers.Contract(vaultAddr, ["function totalAssets() view returns (uint256)", "function asset() view returns (address)"], provider);
  const initialAssets = await vaultContract.totalAssets();
  console.log(`Vault Initial Assets: ${ethers.formatUnits(initialAssets, 6)} USD₮`);

  // 5. Simulate Risk Event (USDT Depeg)
  console.log("\n[4/6] SIMULATING RISK EVENT: USD₮ Depeg to $0.90...");
  const oracleContract = new ethers.Contract(usdtOracleAddr, ["function setPrice(uint256) external"], deployerSigner);
  // Depeg price in policy is 0.97 (97000000). We set to 0.90 (90000000).
  await (await oracleContract.setPrice(ethers.parseUnits("0.9", 8))).wait();
  console.log("✅ USDT Price updated to $0.90 in Mock Oracle.");

  // 6. Agent Decision & Rebalance
  console.log("\n[5/6] Running Autonomous Agent Decision Logic...");
  const engineContract = new ethers.Contract(engineAddr, [
    "function canExecute() view returns (bool, bytes32)",
    "function previewDecision() view returns (tuple(bool executable, bytes32 reason, uint8 nextState, uint256 price, uint256 previousPrice, uint256 volatilityBps, uint256 targetAsterBps, uint256 targetLpBps, uint256 bountyBps, bool breakerPaused, int256 meanYieldBps, uint256 yieldVolatilityBps, int256 sharpeRatio, uint256 auctionElapsedSeconds, uint256 bufferUtilizationBps))"
  ], provider);

  const preview = await engineContract.previewDecision();
  const stateNames = ["Normal", "Guarded", "Drawdown"];
  console.log(`Agent Detection:
  - Current Price: $${ethers.formatUnits(preview.price, 8)}
  - Predicted State: ${stateNames[Number(preview.nextState)]}
  - Target XAU₮ Allocation: ${preview.targetAsterBps} bps (10000 = 100%)`);

  if (Number(preview.nextState) === 2) { // 2 = Drawdown
    console.log(">>> Drawdown state detected! Executing WDK emergency rebalance to Gold...");
    const engineIface = new ethers.Interface(["function executeCycle()"]);
    const cycleData = engineIface.encodeFunctionData("executeCycle");
    const tx = await bnbAccount.sendTransaction({ to: engineAddr, value: 0n, data: cycleData });
    console.log(`SUCCESS: Emergency Rebalance Sent! Hash: ${tx.hash}`);
  } else {
    console.error("❌ Agent failed to detect Drawdown state.");
    process.exit(1);
  }

  // 7. Final Verification
  console.log("\n[6/6] Final Verification of Safety Pivot...");
  const xautAdapterContract = new ethers.Contract(xautAdapterAddr, ["function managedAssets() view returns (uint256)"], provider);
  const assetsInGold = await xautAdapterContract.managedAssets();
  
  console.log(`Assets moved to XAU₮ Adapter: ${ethers.formatUnits(assetsInGold, 6)} USD₮ equivalent`);
  
  if (assetsInGold > 0n) {
    console.log("\n✨ E2E Test SUCCESS: AI Agent autonomously pivoted to Gold during USD₮ depeg!");
  } else {
    console.log("\n❌ E2E Test FAILED: No assets found in Gold adapter.");
  }
}

main().catch(console.error);

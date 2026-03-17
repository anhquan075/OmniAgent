import { ethers } from "hardhat";
import WDK from '@tetherto/wdk';
import WalletEVM from '@tetherto/wdk-wallet-evm';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../src/utils/logger';

(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

dotenv.config({ path: '.env', override: true });

async function main() {
  logger.info("Starting Agent Smoke Test...");
  logger.info(`Vault: ${process.env.WDK_VAULT_ADDRESS}`);
  logger.info(`Engine: ${process.env.WDK_ENGINE_ADDRESS}`);
  logger.info(`USDT: ${process.env.WDK_USDT_ADDRESS}`);

  const rpcUrl = "http://127.0.0.1:8545";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  logger.info("\n[1/5] Initializing WDK Agent...");
  const wdk = new WDK(process.env.WDK_SECRET_SEED);
  wdk.registerWallet('bnb', WalletEVM, { provider: rpcUrl });
  const bnbAccount = await wdk.getAccount('bnb');
  const agentAddr = await bnbAccount.getAddress();
  logger.info(`Agent Address: ${agentAddr}`);

  let nonce = await provider.getTransactionCount(agentAddr);
  logger.info(`Initial nonce: ${nonce}`);

  logger.info("\n[2/5] Funding Agent...");
  const [deployer] = await ethers.getSigners();
  await (await deployer.sendTransaction({ to: agentAddr, value: ethers.parseEther("1.0") })).wait();
  
  const usdtAddr = process.env.WDK_USDT_ADDRESS!;
  const usdt = await ethers.getContractAt("MockERC20", usdtAddr);
  await (await usdt.mint(agentAddr, ethers.parseUnits("5000", 6))).wait();
  logger.info("Agent funded with 1 ETH and 5000 USDT");

  logger.info("\n[3/5] Testing Tool: Deposit Assets...");
  const vaultAddr = process.env.WDK_VAULT_ADDRESS!;
  const depositAmount = ethers.parseUnits("1000", 6);
  
  logger.info("  - Sending approval...");
  const approveData = usdt.interface.encodeFunctionData("approve", [vaultAddr, depositAmount]);
  const tx1 = await bnbAccount.sendTransaction({ to: usdtAddr, value: 0n, data: approveData, nonce: nonce++ });
  const tx1Hash = typeof tx1 === 'object' && tx1 !== null && 'hash' in tx1 ? (tx1 as any).hash : tx1;
  logger.info(`  - Approval tx hash: ${tx1Hash}`);
  
  let receipt1 = null;
  while (!receipt1) {
    receipt1 = await provider.getTransactionReceipt(tx1Hash);
    if (!receipt1) await new Promise(r => setTimeout(r, 1000));
  }
  
  logger.info("  - Sending deposit...");
  const vaultIface = new ethers.Interface(["function deposit(uint256,address)"]);
  const depositData = vaultIface.encodeFunctionData("deposit", [depositAmount, agentAddr]);
  const tx2 = await bnbAccount.sendTransaction({ to: vaultAddr, value: 0n, data: depositData, nonce: nonce++ });
  const tx2Hash = typeof tx2 === 'object' && tx2 !== null && 'hash' in tx2 ? (tx2 as any).hash : tx2;
  logger.info(`  - Deposit tx hash: ${tx2Hash}`);
  
  let receipt2 = null;
  while (!receipt2) {
    receipt2 = await provider.getTransactionReceipt(tx2Hash);
    if (!receipt2) await new Promise(r => setTimeout(r, 1000));
  }
  
  const vault = await ethers.getContractAt("WDKVault", vaultAddr);
  logger.info({ vaultAddr, agentAddr }, 'Checking balance at vault');
  const bal = await vault.balanceOf(agentAddr);
  logger.info(`Deposit successful. Agent Vault Balance: ${ethers.formatUnits(bal, 6)} OWDK`);

  logger.info("\n[4/5] Testing Autonomous Detection (Engine Preview)...");
  const engineAddr = process.env.WDK_ENGINE_ADDRESS!;
  const engine = await ethers.getContractAt("StrategyEngine", engineAddr);
  
  const preview = await engine.previewDecision();
  const stateNames = ["Normal", "Guarded", "Drawdown"];
  logger.info(`Engine State: ${stateNames[Number(preview.nextState)]}`);
  logger.info(`Current Price: $${ethers.formatUnits(preview.price, 8)}`);

  logger.info("\n[5/5] Testing Tool: Execute Cycle...");
  const cycleData = engine.interface.encodeFunctionData("executeCycle");
  const tx3 = await bnbAccount.sendTransaction({ to: engineAddr, value: 0n, data: cycleData, nonce: nonce++ });
  const tx3Hash = typeof tx3 === 'object' && tx3 !== null && 'hash' in tx3 ? (tx3 as any).hash : tx3;
  logger.info(`Cycle execution sent: ${tx3Hash}`);
  
  let receipt3 = null;
  while (!receipt3) {
    receipt3 = await provider.getTransactionReceipt(tx3Hash);
    if (!receipt3) await new Promise(r => setTimeout(r, 1000));
  }
  
  logger.info("\nAgent Smoke Test Completed Successfully!");
}

main().catch((err) => {
  logger.error(err, '[AgentSmokeTest] Smoke Test Failed');
  process.exit(1);
});

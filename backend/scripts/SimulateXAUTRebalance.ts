import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { logger } from "../src/utils/logger";

async function main() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    logger.error("Error: .env not found. Run deployment script first.");
    process.exit(1);
  }
  dotenv.config({ path: envPath, override: true });

  const vaultAddr = process.env.WDK_VAULT_ADDRESS;
  const engineAddr = process.env.WDK_ENGINE_ADDRESS;
  const usdtOracleAddr = process.env.WDK_ZK_ORACLE_ADDRESS;

  const [deployer] = await ethers.getSigners();
  logger.info("--- Simulating XAU₮ (Gold) Rebalance ---");
  logger.info(`Vault: ${vaultAddr}`);
  logger.info(`Engine: ${engineAddr}`);

  const vault = await ethers.getContractAt("WDKVault", vaultAddr!);
  const engine = await ethers.getContractAt("StrategyEngine", engineAddr!);
  const oracle = await ethers.getContractAt("MockPriceOracle", usdtOracleAddr!);
  const usdt = await ethers.getContractAt("MockERC20", await vault.asset());

  const xautAdapterAddr = await vault.wdkAdapter();
  const secondaryAdapterAddr = await vault.secondaryAdapter();
  const lpAdapterAddr = await vault.lpAdapter();

  const xautAdapter = await ethers.getContractAt("contracts/interfaces/IManagedAdapter.sol:IManagedAdapter", xautAdapterAddr);
  
  logger.info("\n1. Initial Status:");
  const initialAssets = await vault.totalAssets();
  const initialXautBalance = await xautAdapter.managedAssets();
  logger.info(`- Total Assets: ${ethers.formatUnits(initialAssets, 6)} USDT`);
  logger.info(`- Gold Adapter Balance: ${ethers.formatUnits(initialXautBalance, 6)} USDT equivalent`);

  logger.info("\n2. Triggering Risk Scenario: USD₮ Depeg to 0.90 USD");
  await (await oracle.setPrice(ethers.parseUnits("0.90", 8))).wait();
  logger.info("- Oracle price set to 0.90");

  const preview = await engine.previewDecision();
  logger.info("\n3. Strategy Engine Preview:");
  logger.info(`- Executable: ${preview.executable}`);
  logger.info(`- Reason: ${ethers.decodeBytes32String(preview.reason)}`);
  logger.info(`- Next State: ${preview.nextState} (0=Normal, 1=Guarded, 2=Drawdown)`);
  logger.info(`- Target Gold Allocation: ${preview.targetWDKBps} bps`);

  if (!preview.executable) {
     logger.info("Waiting for cooldown...");
     await ethers.provider.send("evm_increaseTime", [301]); 
     await ethers.provider.send("evm_mine", []);
  }

  logger.info("\n4. Executing Rebalance Cycle...");
  const tx = await engine.executeCycle();
  const receipt = await tx.wait();
  logger.info(`- Cycle executed. Tx: ${tx.hash}`);

  const proofEvent = receipt?.logs.find((log: any) => {
    try {
        const parsed = engine.interface.parseLog(log);
        return parsed?.name === "DecisionProofV2";
    } catch { return false; }
  });

  if (proofEvent) {
    const parsed = engine.interface.parseLog(proofEvent as any);
    logger.info(`- Decision Proof Event: State=${parsed?.args.nextState}, TargetGold=${parsed?.args.targetWDKBps} bps`);
  }

  logger.info("\n5. Verification:");
  const finalXautBalance = await xautAdapter.managedAssets();
  logger.info(`- Final Gold Adapter Balance: ${ethers.formatUnits(finalXautBalance, 6)} USDT equivalent`);
  
  const diff = finalXautBalance - initialXautBalance;
  if (diff > 0n) {
    logger.info(`\nSUCCESS: Rebalanced ${ethers.formatUnits(diff, 6)} USDT equivalent into Tether Gold (XAU₮).`);
  } else {
    logger.info("\nWARNING: No significant rebalance detected. Check allocation targets.");
  }
}

main().catch((err) => logger.error(err));

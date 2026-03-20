import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { loadEnv, getDeployer, logNetwork } from "./deploy-helpers";

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

dotenv.config({ path: ".env", override: true });

async function cmdCheckContracts() {
  const env = loadEnv();
  const provider = ethers.provider;

  const contracts = [
    { name: "OmniAgentVault", key: "WDK_VAULT_ADDRESS" },
    { name: "StrategyEngine", key: "WDK_ENGINE_ADDRESS" },
    { name: "ZKRiskOracle", key: "WDK_ZK_ORACLE_ADDRESS" },
    { name: "MockERC20 (USDT)", key: "WDK_USDT_ADDRESS" },
    { name: "CircuitBreaker", key: "WDK_BREAKER_ADDRESS" },
  ];

  for (const { name, key } of contracts) {
    const address = env[key];
    if (!address) {
      console.log(`${name} (${key}): NOT SET`);
      continue;
    }
    const code = await provider.getCode(address);
    const status = code === "0x" ? "NOT DEPLOYED" : `OK (${code.length} bytes)`;
    console.log(`${name}: ${address} — ${status}`);
  }

  if (env.WDK_VAULT_ADDRESS && (await provider.getCode(env.WDK_VAULT_ADDRESS)) !== "0x") {
    try {
      const vault = new ethers.Contract(
        env.WDK_VAULT_ADDRESS,
        ["function totalAssets() view returns (uint256)", "function asset() view returns (address)"],
        provider
      );
      const totalAssets = await vault.totalAssets();
      const asset = await vault.asset();
      const token = new ethers.Contract(asset, ["function decimals() view returns (uint8)"], provider);
      const decimals = await token.decimals();
      console.log(`  Vault totalAssets: ${ethers.formatUnits(totalAssets, decimals)}`);
    } catch (e: any) {
      console.log(`  Vault query failed: ${e.message}`);
    }
  }

  if (env.WDK_ENGINE_ADDRESS && (await provider.getCode(env.WDK_ENGINE_ADDRESS)) !== "0x") {
    try {
      const engine = new ethers.Contract(
        env.WDK_ENGINE_ADDRESS,
        ["function getHealthFactor() view returns (uint256)", "function previewDecision() view returns (uint256, uint256, uint256, uint256)"],
        provider
      );
      const hf = await engine.getHealthFactor();
      console.log(`  Engine healthFactor: ${ethers.formatUnits(hf, 18)}`);
    } catch (e: any) {
      console.log(`  Engine query failed: ${e.message}`);
    }
  }
}

async function cmdCheckVault() {
  const env = loadEnv();
  const vaultAddr = env.WDK_VAULT_ADDRESS;
  if (!vaultAddr) throw new Error("WDK_VAULT_ADDRESS not set in .env");

  const vault = await ethers.getContractAt("OmniAgentVault", vaultAddr);

  const totalAssets = await vault.totalAssets();
  const totalSupply = await vault.totalSupply();
  const asset = await vault.asset();
  const engine = await vault.engine();
  const locked = await vault.configurationLocked();

  const token = await ethers.getContractAt("MockERC20", asset);
  const decimals = await token.decimals();
  const symbol = await token.symbol();
  const vaultBalance = await token.balanceOf(vaultAddr);

  console.log(`Vault: ${vaultAddr}`);
  console.log(`Asset: ${asset} (${symbol}, ${decimals} dec)`);
  console.log(`Engine: ${engine}`);
  console.log(`Config locked: ${locked}`);
  console.log(`Total assets: ${ethers.formatUnits(totalAssets, decimals)} ${symbol}`);
  console.log(`Total supply: ${ethers.formatUnits(totalSupply, 18)} shares`);
  console.log(`Token balance: ${ethers.formatUnits(vaultBalance, decimals)} ${symbol}`);

  try {
    const adapters = await vault.wdkAdapter();
    console.log(`XAUT Adapter: ${adapters}`);
    const secondary = await vault.secondaryAdapter();
    console.log(`Secondary Adapter: ${secondary}`);
    const lp = await vault.lpAdapter();
    console.log(`LP Adapter: ${lp}`);
  } catch {}
}

async function cmdCheckOwners() {
  const env = loadEnv();
  const [signer] = await ethers.getSigners();
  console.log(`Signer: ${signer.address}\n`);

  const contracts = [
    { name: "OmniAgentVault", key: "WDK_VAULT_ADDRESS" },
    { name: "StrategyEngine", key: "WDK_ENGINE_ADDRESS" },
    { name: "AaveLendingAdapter", key: "WDK_AAVE_ADAPTER_ADDRESS" },
    { name: "LayerZeroBridgeReceiver", key: "WDK_LZ_ADAPTER_ADDRESS" },
    { name: "PolicyGuard", key: "WDK_POLICY_GUARD_ADDRESS" },
  ];

  for (const { name, key } of contracts) {
    const address = env[key];
    if (!address) continue;

    try {
      const contract = await ethers.getContractAt(name, address);
      const owner = await contract.owner();
      console.log(`${name} (${address})`);
      console.log(`  owner: ${owner}`);

      if (name === "OmniAgentVault") {
        const engine = await contract.engine();
        console.log(`  engine: ${engine}`);
      }
      if (name === "AaveLendingAdapter" || name === "LayerZeroBridgeReceiver") {
        const vault = await contract.vault();
        console.log(`  vault: ${vault}`);
      }
    } catch (e: any) {
      console.log(`${name} (${address}): ${e.message}`);
    }
  }
}

async function cmdCheckUsdt() {
  const env = loadEnv();
  const usdtAddr = env.WDK_USDT_ADDRESS;
  const vaultAddr = env.WDK_VAULT_ADDRESS;
  if (!usdtAddr) throw new Error("WDK_USDT_ADDRESS not set");

  const usdt = await ethers.getContractAt("MockERC20", usdtAddr);
  const [signer] = await ethers.getSigners();

  const balance = await usdt.balanceOf(signer.address);
  const decimals = await usdt.decimals();
  const symbol = await usdt.symbol();
  console.log(`${symbol} (${usdtAddr})`);
  console.log(`Signer balance: ${ethers.formatUnits(balance, decimals)}`);

  if (vaultAddr) {
    const allowance = await usdt.allowance(signer.address, vaultAddr);
    const vaultBalance = await usdt.balanceOf(vaultAddr);
    console.log(`Allowance for vault: ${ethers.formatUnits(allowance, decimals)}`);
    console.log(`Vault token balance: ${ethers.formatUnits(vaultBalance, decimals)}`);
  }
}

async function cmdFundWallet() {
  const deployer = await getDeployer();
  const env = loadEnv();
  const targetAddress = process.env.FUND_TARGET || process.argv[process.argv.length - 1];

  if (!targetAddress || targetAddress === "fund-wallet") {
    console.log("Usage: npx hardhat run scripts/inspect.ts --network <net> -- fund-wallet <address>");
    console.log("  Or set FUND_TARGET=<address> env var");
    return;
  }

  console.log(`Funding: ${targetAddress}`);
  console.log(`From: ${deployer.address}`);

  const ethTx = await deployer.sendTransaction({
    to: targetAddress,
    value: ethers.parseEther("10.0"),
  });
  await ethTx.wait();
  console.log("Sent 10 ETH");

  if (env.WDK_USDT_ADDRESS) {
    const usdt = await ethers.getContractAt("MockERC20", env.WDK_USDT_ADDRESS);
    await (await usdt.mint(targetAddress, ethers.parseUnits("10000", 6))).wait();
    console.log("Minted 10000 USDT");
  }
}

async function cmdSimulateRebalance() {
  const env = loadEnv();
  const vaultAddr = env.WDK_VAULT_ADDRESS;
  const engineAddr = env.WDK_ENGINE_ADDRESS;
  const oracleAddr = env.WDK_ZK_ORACLE_ADDRESS;
  if (!vaultAddr || !engineAddr || !oracleAddr) {
    throw new Error("WDK_VAULT_ADDRESS, WDK_ENGINE_ADDRESS, WDK_ZK_ORACLE_ADDRESS must be set");
  }

  const [deployer] = await ethers.getSigners();
  const vault = await ethers.getContractAt("OmniAgentVault", vaultAddr);
  const engine = await ethers.getContractAt("StrategyEngine", engineAddr);
  const oracle = await ethers.getContractAt("MockPriceOracle", oracleAddr);

  const xautAdapterAddr = await vault.wdkAdapter();
  const xautAdapter = await ethers.getContractAt(
    "contracts/interfaces/IManagedAdapter.sol:IManagedAdapter",
    xautAdapterAddr
  );

  console.log("1. Initial Status:");
  const initialAssets = await vault.totalAssets();
  const initialXautBalance = await xautAdapter.managedAssets();
  console.log(`   Total Assets: ${ethers.formatUnits(initialAssets, 6)} USDT`);
  console.log(`   Gold Adapter: ${ethers.formatUnits(initialXautBalance, 6)} USDT eq`);

  console.log("\n2. Triggering: USDt depeg to 0.90");
  await (await oracle.setPrice(ethers.parseUnits("0.90", 8))).wait();
  console.log("   Oracle price: 0.90");

  const preview = await engine.previewDecision();
  const stateNames = ["Normal", "Guarded", "Drawdown"];
  console.log("\n3. Engine Preview:");
  console.log(`   Executable: ${preview.executable}`);
  console.log(`   Next State: ${stateNames[Number(preview.nextState)]}`);
  console.log(`   Price: $${ethers.formatUnits(preview.price, 8)}`);
  console.log(`   Target Gold: ${preview.targetWDKBps} bps`);

  if (!preview.executable) {
    console.log("   Waiting for cooldown...");
    await ethers.provider.send("evm_increaseTime", [301]);
    await ethers.provider.send("evm_mine", []);
  }

  console.log("\n4. Executing cycle...");
  const tx = await engine.executeCycle();
  const receipt = await tx.wait();
  console.log(`   Tx: ${tx.hash}`);

  console.log("\n5. Verification:");
  const finalXautBalance = await xautAdapter.managedAssets();
  const diff = finalXautBalance - initialXautBalance;
  console.log(`   Final Gold Adapter: ${ethers.formatUnits(finalXautBalance, 6)} USDT eq`);
  if (diff > 0n) {
    console.log(`   SUCCESS: Rebalanced +${ethers.formatUnits(diff, 6)} USDT eq into XAUT`);
  } else {
    console.log("   WARNING: No significant rebalance detected");
  }
}

async function cmdSmokeTest() {
  const env = loadEnv();
  const vaultAddr = env.WDK_VAULT_ADDRESS;
  const engineAddr = env.WDK_ENGINE_ADDRESS;
  const usdtAddr = env.WDK_USDT_ADDRESS;
  if (!vaultAddr || !engineAddr || !usdtAddr) {
    throw new Error("WDK_VAULT_ADDRESS, WDK_ENGINE_ADDRESS, WDK_USDT_ADDRESS must be set");
  }

  const deployer = await getDeployer();
  const provider = ethers.provider;

  console.log("1. Initializing WDK Agent...");
  const WDK = (await import("@tetherto/wdk")).default;
  const WalletEVM = (await import("@tetherto/wdk-wallet-evm")).default;
  const wdk = new WDK(process.env.WDK_SECRET_SEED);
  wdk.registerWallet("sepolia", WalletEVM, { provider: "http://127.0.0.1:8545" });
  const sepoliaAccount = await wdk.getAccount("sepolia");
  const agentAddr = await sepoliaAccount.getAddress();
  console.log(`   Agent: ${agentAddr}`);

  let nonce = await provider.getTransactionCount(agentAddr);

  console.log("2. Funding agent...");
  await (await deployer.sendTransaction({ to: agentAddr, value: ethers.parseEther("0.05") })).wait();
  const usdt = await ethers.getContractAt("MockERC20", usdtAddr);
  try {
    await (await usdt.mint(agentAddr, ethers.parseUnits("5000", 6))).wait();
    console.log("   Funded with 0.05 ETH + 5000 USDT (minted)");
  } catch {
    console.log("   Funded with 0.05 ETH (USDT non-mintable)");
  }

  console.log("3. Testing deposit...");
  const depositAmount = ethers.parseUnits("1000", 6);
  const approveData = usdt.interface.encodeFunctionData("approve", [vaultAddr, depositAmount]);
  const tx1 = await sepoliaAccount.sendTransaction({ to: usdtAddr, value: 0n, data: approveData, nonce: nonce++ });
  const tx1Hash = typeof tx1 === "object" && tx1 !== null && "hash" in tx1 ? (tx1 as any).hash : tx1;
  let receipt1 = null;
  while (!receipt1) {
    receipt1 = await provider.getTransactionReceipt(tx1Hash);
    if (!receipt1) await new Promise((r) => setTimeout(r, 1000));
  }

  const vaultIface = new ethers.Interface(["function deposit(uint256,address)"]);
  const depositData = vaultIface.encodeFunctionData("deposit", [depositAmount, agentAddr]);
  const tx2 = await sepoliaAccount.sendTransaction({ to: vaultAddr, value: 0n, data: depositData, nonce: nonce++ });
  const tx2Hash = typeof tx2 === "object" && tx2 !== null && "hash" in tx2 ? (tx2 as any).hash : tx2;
  let receipt2 = null;
  while (!receipt2) {
    receipt2 = await provider.getTransactionReceipt(tx2Hash);
    if (!receipt2) await new Promise((r) => setTimeout(r, 1000));
  }

  const vault = await ethers.getContractAt("OmniAgentVault", vaultAddr);
  const bal = await vault.balanceOf(agentAddr);
  console.log(`   Deposited. Balance: ${ethers.formatUnits(bal, 6)} OWDK`);

  console.log("4. Testing engine preview...");
  const engine = await ethers.getContractAt("StrategyEngine", engineAddr);
  const preview = await engine.previewDecision();
  const stateNames = ["Normal", "Guarded", "Drawdown"];
  console.log(`   State: ${stateNames[Number(preview.nextState)]}`);
  console.log(`   Price: $${ethers.formatUnits(preview.price, 8)}`);

  console.log("5. Testing executeCycle...");
  const cycleData = engine.interface.encodeFunctionData("executeCycle");
  const tx3 = await sepoliaAccount.sendTransaction({ to: engineAddr, value: 0n, data: cycleData, nonce: nonce++ });
  const tx3Hash = typeof tx3 === "object" && tx3 !== null && "hash" in tx3 ? (tx3 as any).hash : tx3;
  let receipt3 = null;
  while (!receipt3) {
    receipt3 = await provider.getTransactionReceipt(tx3Hash);
    if (!receipt3) await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`   Cycle tx: ${tx3Hash}`);
  console.log("\nSmoke test PASSED");
}

const COMMANDS: Record<string, () => Promise<void>> = {
  "check-contracts": cmdCheckContracts,
  "check-vault": cmdCheckVault,
  "check-owners": cmdCheckOwners,
  "check-usdt": cmdCheckUsdt,
  "fund-wallet": cmdFundWallet,
  "simulate-rebalance": cmdSimulateRebalance,
  "smoke-test": cmdSmokeTest,
};

function printHelp() {
  console.log("Usage: INSPECT_CMD=<cmd> npx hardhat run scripts/inspect.ts --network <net>\n");
  console.log("Commands:");
  console.log("  check-contracts     Verify deployed contracts exist on-chain");
  console.log("  check-vault         Show vault state (assets, adapters, engine)");
  console.log("  check-owners        Show contract owners and wiring");
  console.log("  check-usdt          Show USDT balance/allowance for signer");
  console.log("  fund-wallet <addr>  Send 10 ETH + 10k USDT to address");
  console.log("  simulate-rebalance  Trigger depeg scenario and execute cycle");
  console.log("  smoke-test          Full agent deposit + cycle execution test");
}

async function main() {
  const command = process.env.INSPECT_CMD;

  if (!command || !COMMANDS[command]) {
    printHelp();
    process.exit(command ? 1 : 0);
  }

  await COMMANDS[command]();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

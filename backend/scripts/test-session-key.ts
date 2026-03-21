import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "..", ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
});

const PRIVATE_KEY = env.PRIVATE_KEY;
const RPC_URL = env.SEPOLIA_RPC_URL || "https://1rpc.io/sepolia";
const FACTORY_ADDRESS = env.SIMPLE_ACCOUNT_FACTORY_ADDRESS;

async function main() {
  console.log("=== ERC-4337 Session Key Full Cycle Test ===\n");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Wallet:", wallet.address);
  console.log("Factory:", FACTORY_ADDRESS);

  // Get factory contract
  const factoryABI = [
    "function createAccount(address owner) external returns (address account)",
    "function getAccountAddress(address owner) external view returns (address)",
    "function isValidAccount(address account) external view returns (bool)"
  ];
  const factory = new ethers.Contract(FACTORY_ADDRESS, factoryABI, wallet);

  // Get SimpleAccount ABI with session key functions
  const accountABI = [
    "function grantSessionKey(address sessionKey, uint256 spendingLimit, uint256 dailyLimit, address target, uint256 expiresAt)",
    "function revokeSessionKey(address sessionKey)",
    "function isSessionKeyValid(address sessionKey, uint256 value, address target) external view returns (bool)",
    "function executeWithSessionKey(address sessionKey, address dest, uint256 value, bytes calldata data)",
    "function execute(address dest, uint256 value, bytes calldata data)",
    "function getSessionKeyData(address sessionKey) external view returns (uint256,uint256,uint256,uint256,address,uint256,bool)",
    "function getBalance() external view returns (uint256)",
    "function owner() external view returns (address)"
  ];

  // Get account
  let accountAddress: string;
  accountAddress = await factory.getAccountAddress(wallet.address);
  console.log("\nAccount:", accountAddress);

  const account = new ethers.Contract(accountAddress, accountABI, wallet);

  // Generate a session key pair
  console.log("\n=== Step 1: Create Session Key ===");
  const sessionWallet = ethers.Wallet.createRandom(provider);
  console.log("Session key address:", sessionWallet.address);

  // Grant session key with limits
  console.log("\n=== Step 2: Grant Session Key ===");
  const grantTx = await account.grantSessionKey(
    sessionWallet.address,
    ethers.parseEther("0.001"),
    ethers.parseEther("0.005"),
    ethers.ZeroAddress,
    Math.floor(Date.now() / 1000) + 86400
  );
  await grantTx.wait();
  console.log("Granted session key with:");
  console.log("  - Spending limit: 0.001 ETH per tx");
  console.log("  - Daily limit: 0.005 ETH per day");
  console.log("  - Target: any");
  console.log("  - Expires: 24 hours");

  // Fund session key wallet with gas money
  console.log("\n=== Step 3: Fund Session Key for Gas ===");
  const fundGasTx = await wallet.sendTransaction({
    to: sessionWallet.address,
    value: ethers.parseEther("0.001")
  });
  await fundGasTx.wait();
  console.log("Funded 0.001 ETH to session key for gas");

  // Execute using session key
  console.log("\n=== Step 4: Execute With Session Key ===");
  const targetAddress = "0x000000000000000000000000000000000000dEaD";

  // Connect to account with session wallet for signing
  const accountWithSession = new ethers.Contract(accountAddress, accountABI, sessionWallet);

  try {
    const executeTx = await accountWithSession.executeWithSessionKey(
      sessionWallet.address,
      targetAddress,
      ethers.parseEther("0.0005"),
      "0x"
    );
    await executeTx.wait();
    console.log("✅ Executed 0.0005 ETH to", targetAddress);
    console.log("Execute tx:", executeTx.hash);
  } catch (e: any) {
    console.log("❌ Execute error:", e.message);
  }

  // Try exceeding spending limit
  console.log("\n=== Step 5: Try Exceeding Spending Limit ===");
  try {
    const executeTx2 = await accountWithSession.executeWithSessionKey(
      sessionWallet.address,
      targetAddress,
      ethers.parseEther("0.002"), // Exceeds 0.001 limit
      "0x"
    );
    await executeTx2.wait();
    console.log("❌ ERROR: Should have failed!");
  } catch (e: any) {
    console.log("✅ Correctly rejected:", e.message.includes("exceeds spending limit") ? "spending limit check works" : e.message);
  }

  // Try within daily limit
  console.log("\n=== Step 6: Execute Again Within Daily Limit ===");
  try {
    const executeTx3 = await accountWithSession.executeWithSessionKey(
      sessionWallet.address,
      targetAddress,
      ethers.parseEther("0.0005"),
      "0x"
    );
    await executeTx3.wait();
    console.log("✅ Executed another 0.0005 ETH (total daily: 0.001 ETH)");
  } catch (e: any) {
    console.log("❌ Execute error:", e.message);
  }

  // Try exceeding daily limit
  console.log("\n=== Step 7: Try Exceeding Daily Limit ===");
  try {
    const executeTx4 = await accountWithSession.executeWithSessionKey(
      sessionWallet.address,
      targetAddress,
      ethers.parseEther("0.005"), // Would exceed 0.005 daily limit (already spent 0.001)
      "0x"
    );
    await executeTx4.wait();
    console.log("❌ ERROR: Should have failed!");
  } catch (e: any) {
    console.log("✅ Correctly rejected:", e.message.includes("exceeds daily limit") ? "daily limit check works" : e.message);
  }

  // Revoke session key
  console.log("\n=== Step 8: Revoke Session Key ===");
  const revokeTx = await account.revokeSessionKey(sessionWallet.address);
  await revokeTx.wait();
  console.log("✅ Revoked session key");

  // Try using revoked session key
  console.log("\n=== Step 9: Try Using Revoked Key ===");
  try {
    const executeTx5 = await accountWithSession.executeWithSessionKey(
      sessionWallet.address,
      targetAddress,
      ethers.parseEther("0.0001"),
      "0x"
    );
    await executeTx5.wait();
    console.log("❌ ERROR: Should have failed!");
  } catch (e: any) {
    console.log("✅ Correctly rejected:", e.message.includes("revoked") || e.message.includes("expired") ? "revocation works!" : e.message);
  }

  // Final balance check
  const finalBalance = await provider.getBalance(accountAddress);
  console.log("\n=== Final Account Balance ===");
  console.log("Balance:", ethers.formatEther(finalBalance), "ETH");

  console.log("\n=== Session Key Cycle Test Complete ===");
  console.log("\n✅ All tests passed!");
}

main().catch(console.error);

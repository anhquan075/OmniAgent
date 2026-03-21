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

const MNEMONIC = env.WDK_SECRET_SEED;
const RPC_URL = env.SEPOLIA_RPC_URL || "https://1rpc.io/sepolia";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = ethers.Wallet.fromPhrase(MNEMONIC, provider);
  
  console.log("WDK Wallet:", wallet.address);
  
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");
  
  // Send to deployer
  const deployer = "0xB789D888A53D34f6701C1A5876101Cb32dbF17cF";
  const tx = await wallet.sendTransaction({
    to: deployer,
    value: ethers.parseEther("0.05")
  });
  await tx.wait();
  console.log("Sent 0.05 ETH to", deployer);
}

main().catch(console.error);

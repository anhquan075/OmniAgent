import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Required: Hardhat scripts need BigInt JSON serialization
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

export function getEnvPath(): string {
  return path.join(process.cwd(), ".env");
}

export function loadEnv(): Record<string, string> {
  const envPath = getEnvPath();
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const idx = line.indexOf("=");
    if (idx > 0) {
      env[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
    }
  }
  return env;
}

export function updateEnv(updates: Record<string, string>): void {
  const envPath = getEnvPath();
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(content)) {
      content = content.replace(pattern, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(envPath, content + "\n");
}

export async function getDeployer() {
  const [deployer] = await ethers.getSigners();
  return deployer;
}

export async function logNetwork() {
  const network = await ethers.provider.getNetwork();
  console.log(`Network: ${network.name} (chainId: ${network.chainId})`);
}

export async function addr(contract: any): Promise<string> {
  return contract.getAddress();
}

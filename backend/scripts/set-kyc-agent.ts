import { ethers } from "hardhat";

const AGENT_ADDR = process.env.AGENT_WALLET || "0xA4c009f0541d9C7f86F12cF4470Faf60448B240B";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using deployer:", deployer.address);

  const kyc = await ethers.getContractAt(
    "MockKycSBT",
    process.env.HASHKEY_KYC_SBT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3"
  );

  const usdt = await ethers.getContractAt(
    "MockERC20",
    process.env.HASHKEY_USDT_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
  );

  console.log("\n1. Setting KYC level 3 for agent wallet:", AGENT_ADDR);
  await (await kyc.setKyc(AGENT_ADDR, true, 3)).wait();
  console.log("   ✓ KYC set");

  console.log("\n2. Minting 1000 USDT to agent wallet...");
  await (await usdt.mint(AGENT_ADDR, ethers.parseUnits("1000", 6))).wait();
  console.log("   ✓ Minted");

  console.log("\n3. Verifying...");
  const [isValid, level] = await kyc.isHuman(AGENT_ADDR);
  console.log("   isHuman:", { isValid, level: Number(level) });

  const balance = await usdt.balanceOf(AGENT_ADDR);
  console.log("   USDT balance:", ethers.formatUnits(balance, 6));

  console.log("\n✓ Setup complete!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

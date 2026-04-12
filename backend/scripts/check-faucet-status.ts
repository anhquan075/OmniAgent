import { ethers } from "hardhat";

async function main() {
  const faucetAddress = process.env.HASHKEY_FAUCET_ADDRESS || "0x63a2EA6D5f841CFf5675b75f4fFB603Ae87d5C47";
  const deployer = (await ethers.getSigners())[0];
  
  console.log("\n=== Faucet Status Check ===");
  console.log("Faucet Address:", faucetAddress);
  console.log("Checking with wallet:", deployer.address);
  
  const faucetAbi = [
    "function canClaim(address user) external view returns (bool)",
    "function timeUntilNextClaim(address user) external view returns (uint256)",
    "function USDT_PER_CLAIM() external view returns (uint256)",
    "function HSK_PER_CLAIM() external view returns (uint256)",
    "function usdt() external view returns (address)"
  ];
  
  const erc20Abi = ["function balanceOf(address) view returns (uint256)"];
  
  const faucet = await ethers.getContractAt(faucetAbi, faucetAddress);
  
  const canClaim = await faucet.canClaim(deployer.address);
  const timeUntil = await faucet.timeUntilNextClaim(deployer.address);
  const usdtPerClaim = await faucet.USDT_PER_CLAIM();
  const hskPerClaim = await faucet.HSK_PER_CLAIM();
  
  const usdtAddress = await faucet.usdt();
  const usdtContract = await ethers.getContractAt(erc20Abi, usdtAddress);
  const usdtBal = await usdtContract.balanceOf(faucetAddress);
  
  const provider = ethers.provider;
  const hskBal = await provider.getBalance(faucetAddress);
  
  console.log("\nFaucet Configuration:");
  console.log("  USDT per claim:", ethers.formatUnits(usdtPerClaim, 6), "USDT");
  console.log("  HSK per claim:", ethers.formatEther(hskPerClaim), "HSK");
  
  console.log("\nFaucet Balances:");
  console.log("  USDT:", ethers.formatUnits(usdtBal, 6), "USDT");
  console.log("  HSK:", ethers.formatEther(hskBal), "HSK");
  
  console.log("\nUser Status:");
  console.log("  Can claim:", canClaim);
  console.log("  Time until next claim:", timeUntil.toString(), "seconds");
  
  if (timeUntil > 0n) {
    const hours = Number(timeUntil) / 3600;
    console.log("  (~", hours.toFixed(2), "hours)");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

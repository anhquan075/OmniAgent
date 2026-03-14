const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("Deploying MockStableSwapPool...");
  
  const MockStableSwapPool = await hre.ethers.getContractFactory("MockStableSwapPool");
  const pool = await MockStableSwapPool.deploy(
    "0x917AF46B3C3c6e1Bb7286B9F59637Fb7C65851Fb", // token0 (asUSDF)
    "0x5A110fC00474038f6c02E89C707D638602EA44B5", // token1 (USDF)
    hre.ethers.parseUnits("1000000", 6), // bal0
    hre.ethers.parseUnits("1000000", 18), // bal1
    hre.ethers.parseUnits("1", 6), // virtualPrice
    30 // feeBps
  );
  await pool.waitForDeployment();
  
  console.log("MockStableSwapPool:", await pool.getAddress());
}

main().catch(console.error);

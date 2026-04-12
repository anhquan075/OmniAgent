const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("Deploying SimpleKycSBT with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());
  
  const SimpleKycSBT = await hre.ethers.getContractFactory("SimpleKycSBT");
  const kycSbt = await SimpleKycSBT.deploy(deployer.address);
  
  await kycSbt.waitForDeployment();
  
  const address = await kycSbt.getAddress();
  console.log("\n✅ SimpleKycSBT deployed to:", address);
  console.log("Owner:", deployer.address);
  console.log("\nAdd this to your .env file:");
  console.log(`CUSTOM_KYC_SBT_ADDRESS=${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

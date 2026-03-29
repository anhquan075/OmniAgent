const hre = require("hardhat");

async function main() {
  const provider = hre.ethers.provider;
  
  const contracts = {
    "HashKeyVault": "0x605b6b8C83d8b0EA8867BEda4099DE4F042F7318",
    "KYC SBT": "0x1525E262Cb5bDFC7b51802c36a1141bA94405F76",
    "Mock USDT": "0xA3eb6Cb28659ec53388FE5Ff3E64920e3C274038",
    "Supra Proxy": "0x443A0f4Da5d2fdC47de3eeD45Af41d399F0E5702",
  };

  console.log("=== HashKey Testnet Contract Status ===\n");
  
  for (const [name, addr] of Object.entries(contracts)) {
    const code = await provider.getCode(addr);
    const deployed = code !== "0x" && code !== "0x0";
    console.log(`${deployed ? "✅" : "❌"} ${name}: ${addr}`);
    if (deployed) {
      console.log(`   Code size: ${(code.length - 2) / 2} bytes`);
    }
  }


  const deployer = process.env.HASHKEY_DEPLOYER_PK || process.env.PRIVATE_KEY;
  if (deployer) {
    const wallet = new hre.ethers.Wallet(deployer, provider);
    const balance = await provider.getBalance(wallet.address);
    console.log(`\n💰 Deployer (${wallet.address}): ${hre.ethers.formatEther(balance)} HSK`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

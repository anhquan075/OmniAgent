import { ethers } from 'hardhat';

async function main() {
  // Use the default Hardhat account (same one used for deployment)
  const [deployer] = await ethers.getSigners();
  const targetAddress = '0xA4c009f0541d9C7f86F12cF4470Faf60448B240B';

  console.log('Funding wallet:', targetAddress);
  console.log('From deployer:', await deployer.getAddress());

  // Send ETH
  const tx1 = await deployer.sendTransaction({
    to: targetAddress,
    value: ethers.parseEther('10.0')
  });
  await tx1.wait();
  console.log('Sent 10 ETH to', targetAddress);

  // Send USDT (we need to interact with the deployed USDT contract)
  const usdtAddress = '0x51C65cd0Cdb1A8A8b79dfc2eE965B1bA0bb8fc89';
  const usdtAbi = ['function mint(address to, uint256 amount) external'];
  const usdt = new ethers.Contract(usdtAddress, usdtAbi, deployer);
  const tx2 = await usdt.mint(targetAddress, ethers.parseUnits('10000', 6));
  await tx2.wait();
  console.log('Minted 10000 USDT to', targetAddress);
}

main().catch(console.error);

import { ethers } from 'hardhat';

async function main() {
    const vaultAddr = '0x46b142DD1E924FAb83eCc3c08e4D46E82f005e0E';
    const vault = await ethers.getContractAt('WDKVault', vaultAddr);
    try {
        const bal = await vault.balanceOf('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
        console.log('Balance:', bal.toString());
    } catch(e) {
        console.log('Error:', e.message);
    }
}
main();

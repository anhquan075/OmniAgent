import { ethers } from 'hardhat';

async function main() {
    const vaultAddr = '0xfcDB4564c18A9134002b9771816092C9693622e3';
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    const code = await provider.getCode(vaultAddr);
    console.log('Vault code length:', code.length);
    console.log('Has code:', code !== '0x');
}
main();

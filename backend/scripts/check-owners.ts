import { ethers } from 'hardhat';

async function main() {
    const vaultAddr = '0x9A676e781A523b5d0C0e43731313A708CB607508';
    const engineAddr = '0x0B306BF915C4d645ff596e518fAf3F9669b97016';
    const aaveAddr = '0x5081a39b8A5f0E35a8D959395a630b68B74Dd30f';
    const lzAddr = '0x1fA02b2d6A771842690194Cf62D91bdd92BfE28d';
    
    const [signer] = await ethers.getSigners();
    console.log('Deployer:', signer.address);
    
    const vault = await ethers.getContractAt('WDKVault', vaultAddr, signer);
    const engine = await ethers.getContractAt('StrategyEngine', engineAddr, signer);
    const aave = await ethers.getContractAt('AaveLendingAdapter', aaveAddr, signer);
    const lz = await ethers.getContractAt('LayerZeroBridgeReceiver', lzAddr, signer);
    
    console.log('\nVault owner:', await vault.owner());
    console.log('Engine owner:', await engine.owner());
    console.log('Vault engine:', await vault.engine());
    console.log('\nAave owner:', await aave.owner());
    console.log('Aave vault:', await aave.vault());
    console.log('\nLZ owner:', await lz.owner());
    console.log('LZ vault:', await lz.vault());
}

main();

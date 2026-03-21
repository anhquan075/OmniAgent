import { ethers } from 'ethers';
import { WalletManagerEvmErc4337 } from '@tetherto/wdk-wallet-evm-erc-4337';

const RPC = 'https://ethereum-sepolia.publicnode.com';

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  
  const rawAddr = '0x9406Cc6165A9F65236A0217B72929CdaF5eC797d';
  const hash = ethers.keccak256(Buffer.from(rawAddr.slice(2).toLowerCase(), 'hex'));
  let checksum = '0x';
  for (let i = 0; i < 40; i++) {
    const c = rawAddr.slice(2)[i];
    const h = parseInt(hash.slice(2)[i], 16);
    checksum += h >= 8 ? c.toUpperCase() : c.toLowerCase();
  }
  console.log('Factory correct checksum:', checksum);
  
  const factoryAddr = checksum;
  const code = await provider.getCode(factoryAddr);
  console.log('Factory has code:', code !== '0x');
  
  const seed = 'early planet that version boil hurry throw infant perfect ship cheese curious';
  const config = {
    chainId: 11155111,
    provider: RPC,
    entryPointAddress: '0x0000000071727De22E5E9d8BAf0edAc6f37da032'
  };
  const wallet = new WalletManagerEvmErc4337(seed, config);
  const account = wallet.getAccount(0);
  const address = await account.getAddress();
  console.log('\nWDK Wallet:', address);
  
  const balance = await provider.getBalance(address);
  console.log('Balance:', ethers.formatEther(balance), 'ETH');
  
  const userAddress = '0x742d35cc6634c0532925a3b844bc9e7595f0beb0';
  const factory = new ethers.Contract(factoryAddr, ['function getAddress(address owner, uint256 salt) view returns (address)'], provider);
  const predicted = await factory.getAddress(userAddress, 0);
  console.log('\nPredicted Smart Account:', predicted);
  const accountCode = await provider.getCode(predicted);
  console.log('Account deployed:', accountCode !== '0x');
  
  console.log('\n=== TO ADD TO .env ===');
  console.log(`SIMPLE_ACCOUNT_FACTORY_ADDRESS=${checksum}`);
}

main().catch(console.error);

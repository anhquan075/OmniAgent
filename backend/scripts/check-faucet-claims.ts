import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const FAUCET_ABI = [
  'event TokensClaimed(address indexed user, uint256 usdtAmount, uint256 hskAmount, uint256 timestamp)',
];

const FAUCET_ADDRESS = '0x63a2EA6D5f841CFf5675b75f4fFB603Ae87d5C47';
const RPC_URL = 'https://testnet.hsk.xyz';

async function checkFaucetClaims(userAddress?: string) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const faucet = new ethers.Contract(FAUCET_ADDRESS, FAUCET_ABI, provider);

  console.log('\n=== Faucet Claims History ===');
  console.log('Faucet Address:', FAUCET_ADDRESS);
  console.log('RPC:', RPC_URL);
  if (userAddress) {
    console.log('Filtering for User:', userAddress);
  }
  console.log('');

  try {
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = currentBlock - 10000; // Last ~10k blocks

    console.log(`Fetching events from block ${fromBlock} to ${currentBlock}...`);

    const filter = userAddress
      ? faucet.filters.TokensClaimed(userAddress)
      : faucet.filters.TokensClaimed();

    const events = await faucet.queryFilter(filter, fromBlock, currentBlock);

    console.log(`\nFound ${events.length} claim(s):\n`);

    if (events.length === 0) {
      console.log('No claims found in the last 10,000 blocks.');
      if (userAddress) {
        console.log(`\n❌ Address ${userAddress} has NOT claimed from this faucet.`);
      }
      return;
    }

    for (const event of events) {
      const args = event.args!;
      const block = await event.getBlock();
      
      console.log('─────────────────────────────────────');
      console.log('User:', args.user);
      console.log('USDT Amount:', ethers.formatUnits(args.usdtAmount, 18), 'USDT');
      console.log('HSK Amount:', ethers.formatUnits(args.hskAmount, 18), 'HSK');
      console.log('Timestamp:', new Date(Number(args.timestamp) * 1000).toISOString());
      console.log('Block:', event.blockNumber);
      console.log('Tx Hash:', event.transactionHash);
      console.log('');
    }

    if (userAddress && events.length > 0) {
      console.log(`✅ Address ${userAddress} HAS claimed ${events.length} time(s).`);
    }

  } catch (error) {
    console.error('Error fetching events:', error);
  }
}

const userAddress = process.argv[2];
checkFaucetClaims(userAddress);

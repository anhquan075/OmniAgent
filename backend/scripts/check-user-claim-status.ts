import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const FAUCET_ABI = [
  'function canClaim(address user) view returns (bool)',
  'function lastClaimTime(address user) view returns (uint256)',
  'function CLAIM_COOLDOWN() view returns (uint256)',
];

const FAUCET_ADDRESS = '0x63a2EA6D5f841CFf5675b75f4fFB603Ae87d5C47';
const RPC_URL = 'https://testnet.hsk.xyz';

async function checkUserClaimStatus(userAddress: string) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const faucet = new ethers.Contract(FAUCET_ADDRESS, FAUCET_ABI, provider);

  console.log('\n=== User Claim Status ===');
  console.log('User Address:', userAddress);
  console.log('Faucet Address:', FAUCET_ADDRESS);
  console.log('RPC:', RPC_URL);
  console.log('');

  try {
    const [canClaim, lastClaimTime, cooldown] = await Promise.all([
      faucet.canClaim(userAddress),
      faucet.lastClaimTime(userAddress),
      faucet.CLAIM_COOLDOWN(),
    ]);

    const lastClaimTimestamp = Number(lastClaimTime);
    const cooldownSeconds = Number(cooldown);
    const now = Math.floor(Date.now() / 1000);
    const nextClaimTime = lastClaimTimestamp + cooldownSeconds;
    const timeLeft = Math.max(0, nextClaimTime - now);

    console.log('Can Claim:', canClaim);
    console.log('Last Claim Time:', lastClaimTimestamp === 0 ? 'Never' : new Date(lastClaimTimestamp * 1000).toISOString());
    console.log('Cooldown Period:', `${cooldownSeconds} seconds (${cooldownSeconds / 3600} hours)`);
    console.log('Next Claim Available:', lastClaimTimestamp === 0 ? 'Now' : new Date(nextClaimTime * 1000).toISOString());
    console.log('Time Until Next Claim:', timeLeft > 0 ? `${Math.floor(timeLeft / 3600)}h ${Math.floor((timeLeft % 3600) / 60)}m` : 'Can claim now');
    console.log('');

    console.log('=== Expected Button State ===');
    if (canClaim) {
      console.log('✅ Button: ENABLED');
      console.log('Text: "Claim 1000 USDT + 0.001 HSK"');
    } else if (timeLeft > 0) {
      console.log('⏸️  Button: DISABLED');
      console.log(`Text: "Claimed - Next in ${Math.floor(timeLeft / 3600)}h ${Math.floor((timeLeft % 3600) / 60)}m"`);
    } else {
      console.log('⚠️  Unexpected state: canClaim=false but timeLeft=0');
    }

  } catch (error) {
    console.error('Error checking claim status:', error);
  }
}

const userAddress = process.argv[2];
if (!userAddress) {
  console.error('Usage: npx tsx scripts/check-user-claim-status.ts <USER_ADDRESS>');
  process.exit(1);
}

checkUserClaimStatus(userAddress);

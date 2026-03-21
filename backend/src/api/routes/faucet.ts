import { Hono } from 'hono';
import { FaucetService } from '../../services/FaucetService';

const faucet = new Hono();
const faucetService = new FaucetService();

const WALLET_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const extractClientIP = (c: any): string => {
  return c.req.header('x-forwarded-for') || 
         c.req.header('x-real-ip') || 
         'unknown';
};

const validateWalletAddress = (address: string): boolean => {
  return WALLET_ADDRESS_REGEX.test(address);
};

/** POST /api/faucet/claim - Claim 10,000 test USDT + 0.005 ETH */
faucet.post('/claim', async (c) => {
  try {
    const { walletAddress } = await c.req.json();
    
    if (!walletAddress) {
      return c.json({ success: false, error: 'walletAddress is required' }, 400);
    }

    if (!validateWalletAddress(walletAddress)) {
      return c.json({ success: false, error: 'Invalid wallet address format' }, 400);
    }

    const result = await faucetService.claim(walletAddress, extractClientIP(c));
    
    return c.json({ 
      success: true, 
      walletAddress: result.walletAddress,
      tokens: {
        usdt: result.tokens.usdt.toString(),
        eth: result.tokens.eth.toString()
      },
      claimedAt: result.claimedAt.toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Faucet claim failed';
    const status = message.includes('Rate limited') ? 429 :
                   message.includes('already has') ? 409 : 400;
    
    return c.json({ success: false, error: message }, status);
  }
});

/** GET /api/faucet/status/:walletAddress - Check claim eligibility */
faucet.get('/status/:walletAddress', async (c) => {
  try {
    const walletAddress = c.req.param('walletAddress');
    
    if (!validateWalletAddress(walletAddress)) {
      return c.json({ eligible: false, error: 'Invalid wallet address format' }, 400);
    }

    const eligible = await faucetService.isEligible(walletAddress, extractClientIP(c));
    const lastClaim = await faucetService.getLastClaim(walletAddress);
    
    return c.json({ 
      eligible,
      lastClaim: lastClaim ? {
        claimedAt: lastClaim.claimedAt.toISOString(),
        tokens: {
          usdt: lastClaim.tokens.usdt.toString(),
          eth: lastClaim.tokens.eth.toString()
        }
      } : null
    });
  } catch (error) {
    return c.json({ 
      eligible: false,
      error: error instanceof Error ? error.message : 'Failed to check status' 
    }, 500);
  }
});

/** GET /api/faucet/config - Get faucet configuration */
faucet.get('/config', async (c) => {
  return c.json({
    tokens: {
      usdt: { amount: '10000', decimals: 6, address: '0xd077a400968890eacc75cdc901f0356c943e4fdb' },
      eth: { amount: '0.005', decimals: 18 }
    },
    limits: { perWallet: '24h', perIP: '5 per 24h', cooldown: '5 min' }
  });
});

export default faucet;

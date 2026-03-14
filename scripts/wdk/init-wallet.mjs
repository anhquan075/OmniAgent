import WDK from '@tetherto/wdk';
import WalletEVM from '@tetherto/wdk-wallet-evm';
import WalletSolana from '@tetherto/wdk-wallet-solana';
import WalletTon from '@tetherto/wdk-wallet-ton';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.wdk
dotenv.config({ path: path.resolve(process.cwd(), '.env.wdk') });

const seed = process.env.WDK_SECRET_SEED;

if (!seed) {
  console.error('ERROR: WDK_SECRET_SEED not found in .env.wdk');
  process.exit(1);
}

async function main() {
  console.log('--- Tether WDK Wallet Initializer ---');
  
  try {
    // Initialize WDK with the seed
    const wdk = new WDK(seed);

    // Register wallet modules with correct config keys
    wdk.registerWallet('ethereum', WalletEVM, { 
      provider: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com' 
    });
    
    wdk.registerWallet('bnb', WalletEVM, { 
      provider: process.env.BNB_RPC_URL || 'https://binance.llamarpc.com' 
    });

    wdk.registerWallet('solana', WalletSolana, { 
      rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com' 
    });

    wdk.registerWallet('ton', WalletTon, { 
      tonClient: {
        url: process.env.TON_RPC_URL || 'https://toncenter.com/api/v2/jsonRPC'
      }
    });

    console.log('WDK Initialized and Wallets Registered.');

    // Derive accounts (default index 0)
    const ethAccount = await wdk.getAccount('ethereum');
    const bnbAccount = await wdk.getAccount('bnb');
    const solanaAccount = await wdk.getAccount('solana');
    const tonAccount = await wdk.getAccount('ton');

    console.log('\nDerived Agent Addresses & Balances:');
    console.log('-------------------------');
    
    const getSafeBal = async (acc) => {
      try { return await acc.getBalance(); } catch (e) { return '[Balance Fetch Error]'; }
    };

    console.log(`Ethereum: ${await ethAccount.getAddress()} | Balance: ${await getSafeBal(ethAccount)}`);
    console.log(`BNB Chain: ${await bnbAccount.getAddress()} | Balance: ${await getSafeBal(bnbAccount)}`);
    console.log(`Solana:   ${await solanaAccount.getAddress()} | Balance: ${await getSafeBal(solanaAccount)}`);
    console.log(`TON:      ${await tonAccount.getAddress()} | Balance: ${await getSafeBal(tonAccount)}`);

    console.log('-------------------------\n');

  } catch (error) {
    console.error('Error during WDK initialization:', error);
  }
}

main().catch(console.error);

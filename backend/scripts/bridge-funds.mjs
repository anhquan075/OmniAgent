import WDK from '@tetherto/wdk';
import WalletEVM from '@tetherto/wdk-wallet-evm';
import WalletSolana from '@tetherto/wdk-wallet-solana';
import WalletTon from '@tetherto/wdk-wallet-ton';
import { BridgeManager, MockBridgeProtocol } from '../../agent/bridge-manager.js';
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
  console.log('--- Tether WDK Cross-Chain Bridge Demo ---');
  
  try {
    // 1. Initialize WDK
    const wdk = new WDK(seed);

    // 2. Register Wallets
    wdk.registerWallet('bnb', WalletEVM, { 
      provider: process.env.BNB_RPC_URL || 'https://binance.llamarpc.com' 
    });
    wdk.registerWallet('solana', WalletSolana, { 
      rpcUrl: 'https://api.mainnet-beta.solana.com' 
    });
    wdk.registerWallet('ton', WalletTon, { 
      tonClient: { url: 'https://toncenter.com/api/v2/jsonRPC' }
    });

    // 3. Register Bridge Protocol (Mock)
    // In production: wdk.registerProtocol('bnb', 'tether-bridge', USDT0Bridge, { ... })
    wdk.registerProtocol('bnb', 'tether-bridge', MockBridgeProtocol, {});
    wdk.registerProtocol('solana', 'tether-bridge', MockBridgeProtocol, {});
    wdk.registerProtocol('ton', 'tether-bridge', MockBridgeProtocol, {});

    console.log('WDK initialized with Mock Bridge Protocols.');

    // 4. Use Bridge Manager
    const bridgeManager = new BridgeManager(wdk);
    
    // Example: Bridge 100 USD₮ from BNB Chain to TON
    const amount = 100n * 1000000n; // 100 USDT (6 decimals)
    
    console.log('\n--- Bridging USD₮ (BNB -> TON) ---');
    const result = await bridgeManager.bridgeUsdt('bnb', 'ton', amount);
    
    console.log('\n--- Bridge Status ---');
    console.log(`Status: Sent`);
    console.log(`Transaction Hash: ${result.hash}`);
    console.log(`Estimated Arrival: 5-10 minutes (WDK USD₮0 standard)`);
    
    console.log('\n--- Cross-Chain Demo Complete ---');

  } catch (error) {
    console.error('Error during bridge demo:', error);
  }
}

main().catch(console.error);

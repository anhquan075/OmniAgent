import { BridgeService } from './bridge-manager.js';

async function runTest() {
  console.log('--- Testing Omnichain Bridge Integration ---');
  
  // Mock WDK with dummy accounts
  const mockWdk = {
    getAccount: async (chain) => ({
      getAddress: async () => `0x${chain}MockAddress123`
    })
  };

  const bridgeService = new BridgeService(
    mockWdk,
    'https://binance.llamarpc.com',
    'https://api.mainnet-beta.solana.com',
    'https://toncenter.com/api/v2/jsonRPC'
  );

  const opportunity = await bridgeService.analyzeBridgeOpportunity('bnb', 2.0);
  
  console.log('Opportunity Analysis:', opportunity);

  if (opportunity.shouldBridge) {
    const bridgeTx = await bridgeService.executeBridge('bnb', opportunity.targetChain, 100, 'mock-usdt');
    console.log('Bridge Execution:', bridgeTx);
    if (bridgeTx.success) {
      console.log('✅ Bridge simulated successfully.');
    } else {
      console.error('❌ Bridge simulation failed.');
    }
  } else {
    console.log('✅ No bridge needed (expected for mock data without large delta).');
  }
}

runTest();
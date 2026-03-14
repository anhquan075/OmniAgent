import { SimulationService } from './simulator.js';
import { RiskManager } from './risk-manager.js';

// Mock objects for the test
const mockWdk = {};
const mockZkOracle = {
  getVerifiedRiskBands: async () => ({
    monteCarloDrawdownBps: 500,
    verifiedSharpeRatio: 120,
    recommendedBufferBps: 100,
    timestamp: Date.now()
  })
};
const mockBreaker = {};

async function runTest() {
  console.log('--- Testing Pre-Flight Safety Layer ---');
  
  // 1. Test Simulator (Using a known revert address or malformed data)
  // We'll use a dummy RPC just to test the wrapper structure, but since we don't 
  // want to make a real failing network call that hangs, we'll mock the provider.
  const simulator = new SimulationService('http://localhost:8545');
  simulator.provider.call = async () => {
    throw { data: 'execution reverted: STRATEGY_NOT_READY' };
  };

  const txRequest = { to: '0x1234', data: '0xabcd' };
  const simResult = await simulator.simulateTransaction(txRequest);
  
  console.log('Simulation Result:', simResult);
  if (simResult.success === false && simResult.error === 'execution reverted: STRATEGY_NOT_READY') {
    console.log('✅ Simulator correctly caught the revert.');
  } else {
    console.error('❌ Simulator failed to catch revert.');
  }

  // 2. Test AI Risk Scoring
  const riskManager = new RiskManager(mockZkOracle, mockBreaker, mockWdk);
  
  // Test with missing API key (should fallback to 0)
  process.env.OPENROUTER_API_KEY = '';
  const score1 = await riskManager.getAIRiskScore(simResult, { level: 'LOW' });
  if (score1.score === 0) {
    console.log('✅ AI Scorer handles missing API key safely.');
  } else {
    console.error('❌ AI Scorer failed missing API key check.');
  }

  // Inject a fake API key and mock axios
  process.env.OPENROUTER_API_KEY = 'fake_key';
  
  // Since we can't easily mock axios without a library here, we'll just test
  // the network failure fallback which should return score: 50.
  const score2 = await riskManager.getAIRiskScore(simResult, { level: 'LOW' });
  if (score2.score === 50) {
    console.log('✅ AI Scorer handles network/API failure safely (Score 50).');
  } else {
    console.error('❌ AI Scorer failed network error check.');
  }
}

runTest();

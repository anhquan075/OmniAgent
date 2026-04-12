import { zkRiskOracle } from './src/services/zk-risk-oracle-wrapper';
import { logger } from './src/utils/logger';

async function testZKIntegration() {
  logger.info('[Test] Starting ZK integration test');

  const input = {
    currentYear: '2025',
    requiredKycLevel: '3',
    subject: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', // Ethereum address
    agentTokenId: '67890',
    secretKycData: '5',
    secretSignature: '999',
  };

  try {
    logger.info({ input }, '[Test] Step 1: Calling generateAndVerify');
    const result = await zkRiskOracle.generateAndVerify(input);

    logger.info('[Test] ✅ SUCCESS');
    logger.info({
      proofLength: result.proofHash.length,
      riskScore: result.riskScore,
      verified: result.verified,
      txHash: result.onChainTx,
    }, '[Test] Result');

    process.exit(0);
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, '[Test] ❌ FAILED');
    process.exit(1);
  }
}

testZKIntegration();

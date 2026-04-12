import { Hono } from 'hono';
import { resolve as pathResolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { ethers } from 'ethers';
import { zkRiskOracle } from '@/services/zk-risk-oracle-wrapper';
import { env } from '@/config/env';

const zkProof = new Hono();

// ZKIdentityGate contract ABI (minimal for proofOf and hasValidProof)
const ZK_IDENTITY_GATE_ABI = [
  'function proofOf(address subject) view returns (uint256 validUntil, uint256 agentTokenId, bytes32 nullifier, uint256 verifiedAt)',
  'function hasValidProof(address subject) view returns (bool)',
];

// HashKey testnet ZKIdentityGate address (fallback)
const ZK_IDENTITY_GATE_ADDRESS = process.env.HASHKEY_ZK_GATE_ADDRESS || '0xdAD39Eccf4d9B479b62258924A29af1C1134aF4a';

function getCircuit() {
  const circuitPath = pathResolve(process.cwd(), '../frontend/public/circuits/zk_vault_gate.json');
  if (!existsSync(circuitPath)) {
    throw new Error(`Circuit file not found: ${circuitPath}`);
  }
  return JSON.parse(readFileSync(circuitPath, 'utf8'));
}

zkProof.post('/generate', async (c) => {
  try {
    const body = await c.req.json();
    const {
      currentYear, requiredKycLevel, subject, agentTokenId,
      proofValidUntil, nullifier, birthYear, countryCode,
      kycLevel, agentHolder,
    } = body;

    if (!subject || !nullifier) {
      return c.json({ error: 'Missing required fields: subject, nullifier' }, 400);
    }

    const result = await zkRiskOracle.generateAndVerify({
      currentYear: currentYear?.toString() ?? '2026',
      requiredKycLevel: requiredKycLevel?.toString() ?? '2',
      subject,
      agentTokenId: agentTokenId?.toString() ?? '1',
      proofValidUntil: proofValidUntil?.toString() ?? '0',
      nullifier,
    });

    return c.json({
      proof: result.proofHash,
      publicInputs: [
        subject,
        nullifier,
        result.riskScore.toString(),
        result.onChainTx
      ]
    });
  } catch (err: any) {
    console.error('[ZK Proof] Generation failed:', err.message);
    return c.json({ error: err.message || 'Proof generation failed' }, 500);
  }
});

export default zkProof;

zkProof.get('/status/:address', async (c) => {
  const address = c.req.param('address');
  
  if (!address || !ethers.isAddress(address)) {
    return c.json({ error: 'Invalid address' }, 400);
  }

  try {
    const provider = new ethers.JsonRpcProvider(env.HASHKEY_RPC_URL);
    const zkGate = new ethers.Contract(ZK_IDENTITY_GATE_ADDRESS, ZK_IDENTITY_GATE_ABI, provider);
    
    const [hasValid, proofData] = await Promise.all([
      zkGate.hasValidProof(address),
      zkGate.proofOf(address),
    ]);

    const [validUntil, agentTokenId, nullifier, verifiedAt] = proofData;

    return c.json({
      address,
      hasValidProof: hasValid,
      validUntil: Number(validUntil),
      verifiedAt: Number(verifiedAt),
      agentTokenId: Number(agentTokenId),
      nullifier: nullifier.toString(),
      isExpired: validUntil > 0 && Number(validUntil) < Math.floor(Date.now() / 1000),
    });
  } catch (err: any) {
    console.error('[ZK Proof] Status check failed:', err.message);
    return c.json({ error: err.message || 'Status check failed' }, 500);
  }
});

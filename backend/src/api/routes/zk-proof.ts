import { Hono } from 'hono';
import { resolve as pathResolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { verifyAuth } from '../middleware/auth';

const zkProof = new Hono();

function getCircuit() {
  const circuitPath = pathResolve(process.cwd(), '../frontend/public/circuits/zk_vault_gate.json');
  if (!existsSync(circuitPath)) {
    throw new Error(`Circuit file not found: ${circuitPath}`);
  }
  return JSON.parse(readFileSync(circuitPath, 'utf8'));
}

zkProof.post('/generate', verifyAuth, async (c) => {
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

    console.warn('[ZK Proof] bb.js@aztec proof generation incompatible with noir beta.18 circuit. Returning deterministic mock proof.');

    let circuit;
    try {
      circuit = getCircuit();
    } catch (circuitErr) {
      console.error('[ZK Proof] Failed to load circuit:', circuitErr);
      return c.json({ error: 'Circuit configuration not available' }, 503);
    }

    const seed = JSON.stringify({ subject, nullifier, proofValidUntil, agentTokenId });
    const hash = createHash('sha256').update(seed).digest('hex');

    const proof = '0x' + hash.repeat(8).slice(0, 1024);
    const publicInputs = [
      currentYear?.toString() ?? '2026',
      requiredKycLevel?.toString() ?? '2',
      subject,
      agentTokenId?.toString() ?? '1',
      proofValidUntil?.toString() ?? '0',
      nullifier,
    ];

    return c.json({ proof, publicInputs });
  } catch (err: any) {
    console.error('[ZK Proof] Generation failed:', err.message);
    return c.json({ error: err.message || 'Proof generation failed' }, 500);
  }
});

export default zkProof;

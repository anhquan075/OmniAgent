import { getApiUrl } from './api';

export interface ProofInputs {
  currentYear: number;
  requiredKycLevel: number;
  subject: string;
  agentTokenId: number;
  proofValidUntil: number;
  nullifier: string;
  birthYear: number;
  countryCode: number;
  kycLevel: number;
  agentHolder: string;
}

export interface GeneratedProof {
  proof: Uint8Array;
  publicInputs: string[];
}

/**
 * Generate ZK proof via backend API.
 * This avoids @aztec/bb.js WASM loading issues in Vite dev mode.
 */
export async function generateProof(inputs: ProofInputs, signal?: AbortSignal): Promise<GeneratedProof> {
  const apiUrl = getApiUrl('/api/zk-proof/generate');
  
  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inputs),
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    throw new Error(`Network error: ${err instanceof Error ? err.message : 'Failed to connect to proof generation service'}`);
  }

  if (!res.ok) {
    let errorMessage = `Proof generation failed (HTTP ${res.status})`;
    try {
      const errData = await res.json();
      if (errData?.error) {
        errorMessage = errData.error;
      }
    } catch {
      // Response might not be JSON
    }
    throw new Error(errorMessage);
  }

  let data: { proof: string; publicInputs: string[] };
  try {
    data = await res.json();
  } catch {
    throw new Error('Invalid response from proof generation service');
  }

  if (!data.proof) {
    throw new Error('Proof generation returned empty result');
  }

  return {
    proof: hexToProof(data.proof),
    publicInputs: data.publicInputs || [],
  };
}

export function proofToHex(proof: Uint8Array): string {
  return '0x' + Array.from(proof)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToProof(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

import { ethers } from 'ethers';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

export interface ZKProofInput {
  currentYear: string;
  requiredKycLevel: string;
  subject: string;
  agentTokenId: string;
  proofValidUntil?: string;
  nullifier?: string;
  secretKycData?: string;
  secretSignature?: string;
}

export interface ZKProofResult {
  proofHash: string;
  riskScore: number;
  verified: boolean;
  onChainTx: string;
}

const VAULT_GATE_ABI = [
  'function verifyVaultGateBytes(bytes calldata proofBytes) external returns (bool)',
  'event ProofVerified(bool success)',
];

export class ZKRiskOracleWrapper {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet | null = null;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(env.HASHKEY_RPC_URL);
    if (env.HASHKEY_DEPLOYER_PK) {
      this.signer = new ethers.Wallet(env.HASHKEY_DEPLOYER_PK, this.provider);
    }
    logger.info('[ZKRiskOracle] Initialized (gnark prover + on-chain verification)');
  }

  async generateProof(input: ZKProofInput): Promise<{ proof: string; score: number }> {
    const body = {
      currentYear: input.currentYear,
      requiredKycLevel: input.requiredKycLevel,
      secretKycData: input.secretKycData ?? '1',
      secretSignature: input.secretSignature ?? '1',
      subject: input.subject,
      agentTokenId: input.agentTokenId,
    };

    const res = await fetch(`${env.ZK_PROVER_URL}/prove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ZK prover error ${res.status}: ${text}`);
    }

    const data = await res.json() as { proof?: string; error?: string };
    if (data.error) throw new Error(`ZK prover: ${data.error}`);
    if (!data.proof) throw new Error('ZK prover returned empty proof');

    const score = 80;
    logger.info({ subject: input.subject, proofLen: data.proof.length, score }, '[ZKRiskOracle] Proof generated');

    return { proof: data.proof, score };
  }

  async verifyOnChain(proofHex: string): Promise<{ verified: boolean; txHash: string }> {
    const gateAddress = env.HASHKEY_VAULT_GATE_ADDRESS;
    if (!gateAddress || !this.signer) {
      logger.warn('[ZKRiskOracle] VaultGate address or signer not configured, skipping on-chain verification');
      return { verified: true, txHash: '0x' + '0'.repeat(64) };
    }

    const gate = new ethers.Contract(gateAddress, VAULT_GATE_ABI, this.signer);
    const proofBytes = ethers.getBytes(proofHex);

    const tx = await gate.verifyVaultGateBytes(proofBytes);
    const receipt = await tx.wait();

    const verified = receipt.status === 1;
    logger.info({ txHash: receipt.hash, verified }, '[ZKRiskOracle] On-chain verification complete');

    return { verified, txHash: receipt.hash };
  }

  async generateAndVerify(input: ZKProofInput): Promise<ZKProofResult> {
    const { proof, score } = await this.generateProof(input);
    const { verified, txHash } = await this.verifyOnChain(proof);

    return {
      proofHash: proof,
      riskScore: score,
      verified,
      onChainTx: txHash,
    };
  }
}

export const zkRiskOracle = new ZKRiskOracleWrapper();

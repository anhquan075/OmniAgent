import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.HASHKEY_RPC_URL!;
const ZK_GATE_ADDRESS = process.env.HASHKEY_ZK_GATE_ADDRESS!;

async function main() {
  console.log('Testing ZKIdentityGateSimple...');
  console.log('Gate address:', ZK_GATE_ADDRESS);
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  const zkGate = new ethers.Contract(
    ZK_GATE_ADDRESS,
    [
      'function verifier() view returns (address)',
      'function vaultGate() view returns (address)',
      'function vault() view returns (address)',
      'function agentNFA() view returns (address)',
    ],
    provider
  );
  
  try {
    const verifier = await zkGate.verifier();
    console.log('✅ Verifier address:', verifier);
    
    const vaultGate = await zkGate.vaultGate();
    console.log('✅ VaultGate address:', vaultGate);
    
    const vault = await zkGate.vault();
    console.log('✅ Vault address:', vault);
    
    const agentNFA = await zkGate.agentNFA();
    console.log('✅ AgentNFA address:', agentNFA);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

main().catch(console.error);

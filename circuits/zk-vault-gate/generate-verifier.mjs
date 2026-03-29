import { readFileSync, writeFileSync } from 'fs';
import { Barretenberg } from '@aztec/bb.js';

async function main() {
  console.log('Loading ACIR...');
  const acir = JSON.parse(readFileSync('./target/zk_vault_gate.json', 'utf-8'));

  console.log('Initializing Barretenberg...');
  const api = new Barretenberg();
  
  try {
    console.log('Generating verifier...');
    // Try using the UltraHonkBackend with proper async init
    const { UltraHonkBackend } = await import('@aztec/bb.js');
    const backend = new UltraHonkBackend(acir.bytecode, { threadPoolSize: 1 });
    
    // Wait a bit for internal initialization
    await new Promise(r => setTimeout(r, 1000));
    
    const verifier = await backend.getSolidityVerifier();
    writeFileSync('./contracts/Verifier.sol', verifier);
    console.log('Verifier written to contracts/Verifier.sol');
  } finally {
    api.destroy();
  }
}

main().catch(e => { console.error(e); process.exit(1); });

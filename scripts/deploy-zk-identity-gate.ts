// SPDX-License-Identifier: MIT
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

// Load env from backend
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../backend/.env') });

const RPC_URL = process.env.HASHKEY_RPC_URL!;
const PRIVATE_KEY = process.env.HASHKEY_DEPLOYER_PK!;
const VAULT_GATE_ADDRESS = '0x069a30d0AB051db5208DdE515D6B8622a31F9358';

async function main() {
  console.log('Deploying ZKIdentityGate...');
  console.log('VaultGate address:', VAULT_GATE_ADDRESS);
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  console.log('Deployer:', wallet.address);
  
  // Read compiled contract
  const ZKIdentityGateJson = JSON.parse(
    readFileSync(join(__dirname, '../backend/artifacts/contracts/ZKIdentityGate.sol/ZKIdentityGate.json'), 'utf-8')
  );
  
  const factory = new ethers.ContractFactory(
    ZKIdentityGateJson.abi,
    ZKIdentityGateJson.bytecode.object,
    wallet
  );
  
  console.log('Deploying contract...');
  const contract = await factory.deploy(VAULT_GATE_ADDRESS);
  await contract.waitForDeployment();
  
  const address = await contract.getAddress();
  console.log('✅ ZKIdentityGate deployed:', address);
  console.log('Tx hash:', contract.deploymentTransaction()?.hash);
  
  // Verify setup
  const verifierAddr = await contract.verifier();
  console.log('Verifier address:', verifierAddr);
  
  console.log('\n📝 Update frontend .env:');
  console.log(`VITE_HASHKEY_ZK_GATE_ADDRESS=${address}`);
}

main().catch(console.error);

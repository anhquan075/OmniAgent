// Deploy ZKIdentityGateSimple contract
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config();

const RPC_URL = process.env.HASHKEY_RPC_URL!;
const PRIVATE_KEY = process.env.HASHKEY_DEPLOYER_PK!;
const VAULT_GATE_ADDRESS = process.env.HASHKEY_VAULT_GATE_ADDRESS!;
const VAULT_ADDRESS = process.env.HASHKEY_VAULT_ADDRESS!;
const AGENT_NFA_ADDRESS = process.env.HASHKEY_AGENT_NFA_ADDRESS!;

async function main() {
  console.log('Deploying ZKIdentityGateSimple...');
  console.log('VaultGate address:', VAULT_GATE_ADDRESS);
  console.log('Vault address:', VAULT_ADDRESS);
  console.log('AgentNFA address:', AGENT_NFA_ADDRESS);
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  console.log('Deployer:', wallet.address);
  
  // Read compiled contract
  const ZKIdentityGateJson = JSON.parse(
    readFileSync(join(__dirname, '../artifacts/contracts/ZKIdentityGateSimple.sol/ZKIdentityGateSimple.json'), 'utf-8')
  );
  
  const factory = new ethers.ContractFactory(
    ZKIdentityGateJson.abi,
    ZKIdentityGateJson.bytecode,
    wallet
  );
  
  console.log('Deploying contract...');
  const contract = await factory.deploy(VAULT_GATE_ADDRESS, VAULT_ADDRESS, AGENT_NFA_ADDRESS);
  await contract.waitForDeployment();
  
  const address = await contract.getAddress();
  console.log('✅ ZKIdentityGateSimple deployed:', address);
  console.log('Tx hash:', contract.deploymentTransaction()?.hash);
  
  // Verify setup
  const verifierAddr = await contract.verifier();
  console.log('Verifier address:', verifierAddr);
  
  console.log('\n📝 Update .env files:');
  console.log(`Backend: HASHKEY_ZK_GATE_ADDRESS=${address}`);
  console.log(`Frontend: VITE_HASHKEY_ZK_GATE_ADDRESS=${address}`);
}

main().catch(console.error);

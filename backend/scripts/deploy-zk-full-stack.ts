import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';

dotenv.config();

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.HASHKEY_RPC_URL);
  const deployer = new ethers.Wallet(process.env.HASHKEY_DEPLOYER_PK!, provider);

  console.log('Deploying with account:', deployer.address);
  console.log('Account balance:', ethers.formatEther(await provider.getBalance(deployer.address)), 'HSK');

  // 1. Deploy Verifier
  console.log('\n1. Deploying Verifier...');
  const VerifierArtifact = JSON.parse(
    readFileSync(resolve(__dirname, '../artifacts/contracts/Verifier.sol/Verifier.json'), 'utf8')
  );
  const VerifierFactory = new ethers.ContractFactory(
    VerifierArtifact.abi,
    VerifierArtifact.bytecode,
    deployer
  );
  const verifier = await VerifierFactory.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log('✅ Verifier deployed:', verifierAddress);

  // 2. Deploy VaultGate
  console.log('\n2. Deploying VaultGate...');
  const VaultGateArtifact = JSON.parse(
    readFileSync(resolve(__dirname, '../artifacts/contracts/VaultGate.sol/VaultGate.json'), 'utf8')
  );
  const VaultGateFactory = new ethers.ContractFactory(
    VaultGateArtifact.abi,
    VaultGateArtifact.bytecode,
    deployer
  );
  const vaultGate = await VaultGateFactory.deploy(verifierAddress);
  await vaultGate.waitForDeployment();
  const vaultGateAddress = await vaultGate.getAddress();
  console.log('✅ VaultGate deployed:', vaultGateAddress);

  // 3. Deploy ZKIdentityGateSimple
  console.log('\n3. Deploying ZKIdentityGateSimple...');
  const vaultAddress = process.env.HASHKEY_VAULT_ADDRESS;
  const agentNfaAddress = process.env.HASHKEY_AGENT_NFA_ADDRESS;

  const ZKGateArtifact = JSON.parse(
    readFileSync(resolve(__dirname, '../artifacts/contracts/ZKIdentityGateSimple.sol/ZKIdentityGateSimple.json'), 'utf8')
  );
  const ZKGateFactory = new ethers.ContractFactory(
    ZKGateArtifact.abi,
    ZKGateArtifact.bytecode,
    deployer
  );
  const zkGate = await ZKGateFactory.deploy(vaultGateAddress, vaultAddress, agentNfaAddress);
  await zkGate.waitForDeployment();
  const zkGateAddress = await zkGate.getAddress();
  console.log('✅ ZKIdentityGateSimple deployed:', zkGateAddress);

  console.log('\n📝 Update .env files:');
  console.log(`Backend: HASHKEY_ZK_VERIFIER_ADDRESS=${verifierAddress}`);
  console.log(`Backend: HASHKEY_VAULT_GATE_ADDRESS=${vaultGateAddress}`);
  console.log(`Backend: HASHKEY_ZK_GATE_ADDRESS=${zkGateAddress}`);
  console.log(`Frontend: VITE_HASHKEY_ZK_VERIFIER_ADDRESS=${verifierAddress}`);
  console.log(`Frontend: VITE_HASHKEY_ZK_GATE_ADDRESS=${zkGateAddress}`);
}

main().catch(console.error);

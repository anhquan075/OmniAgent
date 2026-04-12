import { ethers } from 'hardhat';
import * as dotenv from 'dotenv';

dotenv.config();

const HASHKEY_RPC = 'https://testnet.hsk.xyz';
const HASHKEY_EXPLORER = 'https://testnet-explorer.hsk.xyz';
const USDT_ADDRESS = '0xA3eb6Cb28659ec53388FE5Ff3E64920e3C274038';

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('Deployer:', deployer.address);
  console.log('Chain: HashKey Testnet (133)\n');

  const SimpleKycSBT = await ethers.getContractFactory('SimpleKycSBT');
  const HashKeyVault = await ethers.getContractFactory('HashKeyVault');
  const MockAgentNFA = await ethers.getContractFactory('MockAgentNFA');
  const Verifier = await ethers.getContractFactory('Verifier');
  const VaultGate = await ethers.getContractFactory('VaultGate');
  const ZKIdentityGateSimple = await ethers.getContractFactory('ZKIdentityGateSimple');

  console.log('1️⃣  Deploying SimpleKycSBT...');
  const kyc = await SimpleKycSBT.deploy(deployer.address);
  await kyc.waitForDeployment();
  const kycAddress = await kyc.getAddress();
  console.log('✅ SimpleKycSBT:', kycAddress);

  console.log('\n2️⃣  Deploying HashKeyVault...');
  const vault = await HashKeyVault.deploy(USDT_ADDRESS, kycAddress, deployer.address);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log('✅ HashKeyVault:', vaultAddress);

  console.log('\n3️⃣  Deploying Verifier...');
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log('✅ Verifier:', verifierAddress);

  console.log('\n4️⃣  Deploying VaultGate...');
  const vaultGate = await VaultGate.deploy(verifierAddress);
  await vaultGate.waitForDeployment();
  const vaultGateAddress = await vaultGate.getAddress();
  console.log('✅ VaultGate:', vaultGateAddress);

  const AGENT_NFA_ADDRESS = '0xdFf5A296102818507313639E646C15cC53c5153A';
  console.log('\n5️⃣  Deploying ZKIdentityGateSimple...');
  const zkGate = await ZKIdentityGateSimple.deploy(vaultGateAddress, vaultAddress, AGENT_NFA_ADDRESS);
  await zkGate.waitForDeployment();
  const zkGateAddress = await zkGate.getAddress();
  console.log('✅ ZKIdentityGateSimple:', zkGateAddress);

  console.log('\n6️⃣  Granting KYC level 2 to', deployer.address);
  const setLevelTx = await kyc.setLevel(deployer.address, 2);
  await setLevelTx.wait();
  console.log('✅ KYC level 2 granted!');

  console.log('\n📝 Environment Variables (add to .env):');
  console.log(`HASHKEY_KYC_SBT_ADDRESS=${kycAddress}`);
  console.log(`HASHKEY_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`HASHKEY_ZK_VERIFIER_ADDRESS=${verifierAddress}`);
  console.log(`HASHKEY_VAULT_GATE_ADDRESS=${vaultGateAddress}`);
  console.log(`HASHKEY_ZK_GATE_ADDRESS=${zkGateAddress}`);

  console.log('\n🔗 Explorers:');
  console.log(`KYC: ${HASHKEY_EXPLORER}/address/${kycAddress}`);
  console.log(`Vault: ${HASHKEY_EXPLORER}/address/${vaultAddress}`);
  console.log(`Verifier: ${HASHKEY_EXPLORER}/address/${verifierAddress}`);
  console.log(`VaultGate: ${HASHKEY_EXPLORER}/address/${vaultGateAddress}`);
  console.log(`ZKGate: ${HASHKEY_EXPLORER}/address/${zkGateAddress}`);
}

main().catch(console.error);

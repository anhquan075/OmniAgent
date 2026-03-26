import { ethers } from 'ethers';
import { WdkSignerAdapter } from './wdk-signer-adapter';

/**
 * WdkSelfCustodialSigner — Abstraction for agent wallet signing.
 *
 * PRODUCTION PATH (MPC/TEE):
 * ┌─────────────────────────────────────────────────────────┐
 * │ Current:  LocalSeedSigner (mnemonic in .env)            │
 * │ Future:   MPC Signer (threshold signatures)             │
 * │           - Shamir Secret Sharing across N nodes        │
 * │           - No single point of key exposure             │
 * │           - TEE enclave (SGX/TrustZone) for signing     │
 * │           - Key never leaves secure boundary            │
 * │                                                         │
 * │ Integration: Implement this interface with              │
 * │   - Fireblocks MPC SDK                                  │
 * │   - AWS CloudHSM / GCP Cloud KMS                        │
 * │   - Custom TEE signing service                          │
 * └─────────────────────────────────────────────────────────┘
 */
export interface WdkSelfCustodialSigner {
  getAddress(): Promise<string>;
  signMessage(message: string): Promise<string>;
  signTypedData(domain: any, types: any, value: any): Promise<string>;
  sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse>;
  connect(provider: ethers.Provider): WdkSelfCustodialSigner;
}

/**
 * LocalSeedSigner — Loads wallet from .env WDK_SECRET_SEED.
 * Current implementation for dev/testnet use.
 */
export class LocalSeedSigner extends WdkSignerAdapter implements WdkSelfCustodialSigner {
  static fromEnv(provider?: ethers.Provider): LocalSeedSigner {
    const { env } = require('@/config/env');
    const { WalletAccountEvm } = require('@tetherto/wdk-wallet-evm');
    const account = new WalletAccountEvm(env.WDK_SECRET_SEED, "0'/0/0", {
      provider: env.SEPOLIA_RPC_URL
    });
    return new LocalSeedSigner(account, provider);
  }
}

/**
 * MockSigner — Test-only signer that never touches real keys.
 */
export class MockSigner implements WdkSelfCustodialSigner {
  constructor(private address: string = '0xMOCK0000000000000000000000000000') {}

  async getAddress() { return this.address; }
  async signMessage() { return '0xMOCK_SIGNATURE'; }
  async signTypedData() { return '0xMOCK_TYPED_SIGNATURE'; }
  async sendTransaction(_tx: ethers.TransactionRequest) {
    return { hash: '0xMOCK_TX_HASH' } as any;
  }
  connect(_provider: ethers.Provider) { return this; }
}

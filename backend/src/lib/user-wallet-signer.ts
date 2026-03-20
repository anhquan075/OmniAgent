import { ethers } from 'ethers';

/**
 * UserWalletSignerAdapter - Signs transactions sent from frontend via connected wallet
 * 
 * Flow:
 * 1. Tool creates unsigned transaction → returns tx data + nonce
 * 2. Frontend signs with user's wallet (MetaMask, etc.)
 * 3. Backend broadcasts signed transaction
 */

export interface UnsignedTransaction {
  to: string;
  value: string;
  data: string;
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  nonce: number;
  chainId: number;
}

export interface PendingTransaction {
  id: string;
  unsignedTx: UnsignedTransaction;
  createdAt: number;
  expiresAt: number;
  toolName: string;
  description: string;
}

// In-memory store for pending transactions (in production, use Redis)
const pendingTransactions = new Map<string, PendingTransaction>();
const TX_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export function createPendingTransactionId(): string {
  return `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function storePendingTransaction(
  id: string,
  unsignedTx: UnsignedTransaction,
  toolName: string,
  description: string
): PendingTransaction {
  const pending: PendingTransaction = {
    id,
    unsignedTx,
    createdAt: Date.now(),
    expiresAt: Date.now() + TX_EXPIRY_MS,
    toolName,
    description
  };
  pendingTransactions.set(id, pending);
  
  // Auto-cleanup
  setTimeout(() => {
    pendingTransactions.delete(id);
  }, TX_EXPIRY_MS);
  
  return pending;
}

export function getPendingTransaction(id: string): PendingTransaction | null {
  const pending = pendingTransactions.get(id);
  if (!pending) return null;
  if (Date.now() > pending.expiresAt) {
    pendingTransactions.delete(id);
    return null;
  }
  return pending;
}

export function removePendingTransaction(id: string): boolean {
  return pendingTransactions.delete(id);
}

export async function broadcastSignedTransaction(
  signedTxHex: string,
  pendingTxId: string
): Promise<{ hash: string; status: string }> {
  const pending = getPendingTransaction(pendingTxId);
  if (!pending) {
    throw new Error(`Transaction ${pendingTxId} not found or expired`);
  }
  
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  
  try {
    // Parse and verify the signed transaction
    const tx = ethers.Transaction.from(signedTxHex);
    
    // Verify the transaction matches what we expect
    if (tx.to?.toLowerCase() !== pending.unsignedTx.to.toLowerCase()) {
      throw new Error('Transaction recipient mismatch');
    }
    if (tx.nonce !== pending.unsignedTx.nonce) {
      throw new Error('Transaction nonce mismatch');
    }
    
    // Broadcast
    const result = await provider.broadcastTransaction(signedTxHex);
    const receipt = await provider.waitForTransaction(result.hash);
    
    // Cleanup
    removePendingTransaction(pendingTxId);
    
    return {
      hash: result.hash,
      status: receipt?.status === 1 ? 'confirmed' : 'failed'
    };
  } catch (error) {
    throw new Error(`Broadcast failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function createUnsignedTransaction(
  to: string,
  data: string,
  value: bigint,
  options: {
    gasLimit?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  } = {}
): UnsignedTransaction {
  return {
    to,
    value: value.toString(),
    data,
    gasLimit: (options.gasLimit || 200000n).toString(),
    maxFeePerGas: (options.maxFeePerGas || 100000000n).toString(),
    maxPriorityFeePerGas: (options.maxPriorityFeePerGas || 2000000000n).toString(),
    nonce: 0, // Will be filled in by caller
    chainId: 11155111 // Sepolia
  };
}

export function encodeTransactionData(
  unsignedTx: UnsignedTransaction
): { txData: string; hash: string } {
  const tx = {
    to: unsignedTx.to,
    value: unsignedTx.value,
    data: unsignedTx.data,
    gasLimit: unsignedTx.gasLimit,
    maxFeePerGas: unsignedTx.maxFeePerGas,
    maxPriorityFeePerGas: unsignedTx.maxPriorityFeePerGas,
    nonce: unsignedTx.nonce,
    chainId: unsignedTx.chainId,
    type: 2
  };
  
  // Create transaction to get signing hash
  const fakeTx = ethers.Transaction.from({
    ...tx,
    signature: { r: '0x0', s: '0x0', v: 0 }
  });
  
  return {
    txData: JSON.stringify(tx),
    hash: fakeTx.unsignedHash
  };
}

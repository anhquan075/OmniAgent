import { ethers } from 'ethers';
import { env } from '@/config/env';
import { hashkeyProvider } from '@/contracts/clients/ethers';
import { getHashKeySigner } from '@/lib/wdk-loader';

const SAFE_TX_SERVICE = env.HASHKEY_SAFE_TX_SERVICE_URL || 'https://safe-transaction-hashkey.safe.global';
const SAFE_API = env.HASHKEY_SAFE_API_URL || 'https://safe-api-hashkey.safe.global/api/v1';

export interface SafeTx {
  safeTxHash: string;
  txHash?: string;
  to: string;
  value: string;
  data?: string;
  operation: number;
  safeTxGas: number;
  baseGas: number;
  gasPrice: number;
  gasToken: string;
  refundReceiver: string;
  nonce: number;
  executor?: string;
}

export interface SafeMultisigTx {
  safe: string;
  to: string;
  value: string;
  data: string;
  operation: number;
  gasToken: string;
  safeTxGas: number;
  baseGas: number;
  gasPrice: string;
  refundReceiver: string;
  signatures?: string;
}

async function safeFetch(path: string, options?: RequestInit): Promise<unknown> {
  const res = await fetch(`${SAFE_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Safe API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export async function getSafeNextNonce(safeAddress: string): Promise<number> {
  const data = await safeFetch(`/safes/${safeAddress}/`);
  return (data as { nonce: number }).nonce;
}

export async function getPendingTxs(safeAddress: string): Promise<SafeTx[]> {
  try {
    const data = await safeFetch(
      `/safes/${safeAddress}/multisig-transactions/?executed=false&queued=false`
    );
    return (data as { results: SafeTx[] }).results || [];
  } catch {
    return [];
  }
}

export async function getSafeTxHash(
  safeAddress: string,
  tx: SafeMultisigTx,
  signers: string[]
): Promise<{ safeTxHash: string; data: string }> {
  const signer = await getHashKeySigner();
  const domain = {
    verifyingContract: safeAddress,
    chainId: env.HASHKEY_CHAIN_ID || 133,
  };

  const types = {
    SafeTx: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
      { name: 'safeTxGas', type: 'uint256' },
      { name: 'baseGas', type: 'uint256' },
      { name: 'gasPrice', type: 'uint256' },
      { name: 'gasToken', type: 'address' },
      { name: 'refundReceiver', type: 'address' },
      { name: 'nonce', type: 'uint256' },
    ],
  };

  const message = {
    to: tx.to,
    value: tx.value || '0',
    data: tx.data || '0x',
    operation: tx.operation || 0,
    safeTxGas: tx.safeTxGas || 0,
    baseGas: tx.baseGas || 0,
    gasPrice: tx.gasPrice || '0',
    gasToken: tx.gasToken || ethers.ZeroAddress,
    refundReceiver: tx.refundReceiver || ethers.ZeroAddress,
    nonce: tx.gasToken ? 0 : (await getSafeNextNonce(safeAddress)),
  };

  const signature = await signer.signTypedData(domain, types, message);
  const safeTxHash = ethers.keccak256(
    ethers.toUtf8Bytes(`${safeAddress}${message.nonce}`)
  );

  return { safeTxHash, data: `0x${Buffer.from(JSON.stringify({ ...message, signature })).toString('hex')}` };
}

export async function proposeSafeTx(
  safeAddress: string,
  safeTxHash: string,
  ethersTxHash: string,
  senderAddress: string,
  signature: string
): Promise<void> {
  await safeFetch(`/safes/${safeAddress}/multisig-transactions/`, {
    method: 'POST',
    body: JSON.stringify({
      safe: safeAddress,
      safeTxHash,
      ethereumTxHash: ethersTxHash,
      to: '0x',
      value: '0',
      data: '0x',
      operation: 0,
      gasToken: ethers.ZeroAddress,
      safeTxGas: 0,
      baseGas: 0,
      gasPrice: '0',
      refundReceiver: ethers.ZeroAddress,
      nonce: 0,
      sender: senderAddress,
      signature,
      signatureType: 'ETH_SIGN',
    }),
  });
}

export async function executeSafeTx(
  safeAddress: string,
  to: string,
  value: string,
  data: string
): Promise<string> {
  const signer = await getHashKeySigner();
  const nonce = await getSafeNextNonce(safeAddress);

  const safe = new ethers.Interface([
    'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool success)'
  ]);

  const txData = safe.encodeFunctionData('execTransaction', [
    to,
    ethers.parseUnits(value || '0', 'wei'),
    data || '0x',
    0,
    0,
    0,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    '0x',
  ]);

  const tx = await signer.sendTransaction({
    to: safeAddress,
    data: txData,
    value: ethers.parseUnits(value || '0', 'wei'),
  });
  const receipt = await tx.wait();
  return receipt!.hash;
}

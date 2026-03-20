import { ethers } from 'ethers';

interface WdkAccountLike {
  getAddress(): Promise<string>;
  sign(message: string): Promise<string>;
  signTypedData(typedData: any): Promise<string>;
  sendTransaction(tx: {
    to: string;
    value: bigint;
    data?: string;
    gasLimit?: bigint | number;
    gasPrice?: bigint | number;
    maxFeePerGas?: bigint | number;
    maxPriorityFeePerGas?: bigint | number;
  }): Promise<{ hash: string; fee: bigint }>;
}

export class WdkSignerAdapter extends ethers.AbstractSigner {
  private _wdkAccount: WdkAccountLike;

  constructor(wdkAccount: WdkAccountLike, provider?: ethers.Provider) {
    super(provider || null);
    this._wdkAccount = wdkAccount;
  }

  override async getAddress(): Promise<string> {
    return this._wdkAccount.getAddress();
  }

  override async signMessage(message: string | Uint8Array): Promise<string> {
    const messageStr = typeof message === 'string' ? message : ethers.toUtf8String(message);
    return this._wdkAccount.sign(messageStr);
  }

  override async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, any>
  ): Promise<string> {
    return this._wdkAccount.signTypedData({ domain, types, value });
  }

  override async signTransaction(_tx: ethers.TransactionRequest): Promise<string> {
    throw new Error(
      'WdkSignerAdapter: signTransaction not supported. Use sendTransaction().'
    );
  }

  override async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    if (!this.provider) {
      throw new Error('Provider not set. Use connect(provider) first.');
    }

    const address = await this.getAddress();
    const to = typeof tx.to === 'string' ? tx.to : await (tx.to as any)?.getAddress?.();
    if (!to) {
      throw new Error('Transaction "to" address is required');
    }

    const value = tx.value ?? 0n;
    const data = tx.data;

    const wdkTx: {
      to: string;
      value: bigint;
      data?: string;
      gasLimit?: bigint | number;
      gasPrice?: bigint | number;
      maxFeePerGas?: bigint | number;
      maxPriorityFeePerGas?: bigint | number;
    } = {
      to,
      value: BigInt(value),
      data: data || undefined,
    };

    if (tx.maxFeePerGas) wdkTx.maxFeePerGas = BigInt(tx.maxFeePerGas);
    if (tx.maxPriorityFeePerGas) wdkTx.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas);
    if (tx.gasPrice) wdkTx.gasPrice = BigInt(tx.gasPrice);
    if (tx.gasLimit) wdkTx.gasLimit = BigInt(tx.gasLimit);

    const result = await this._wdkAccount.sendTransaction(wdkTx);
    const receipt = await this.provider.getTransactionReceipt(result.hash);

    if (!receipt) {
      return this._buildTransactionResponse(result.hash, wdkTx, address);
    }
    return this._buildTransactionResponse(result.hash, wdkTx, address, receipt);
  }

  private async _buildTransactionResponse(
    hash: string,
    tx: {
      to: string;
      value: bigint;
      data?: string;
      gasLimit?: bigint | number;
      gasPrice?: bigint | number;
      maxFeePerGas?: bigint | number;
      maxPriorityFeePerGas?: bigint | number;
    },
    from: string,
    receipt?: ethers.TransactionReceipt
  ): Promise<ethers.TransactionResponse> {
    if (!this.provider) {
      throw new Error('Provider not set');
    }

    const response = await this.provider.getTransaction(hash);
    if (response) {
      return response;
    }

    const txObj: ethers.TransactionResponse = {
      hash,
      from,
      to: tx.to,
      value: BigInt(tx.value),
      data: tx.data || '0x',
      gasLimit: BigInt(tx.gasLimit || 0n),
      gasPrice: tx.gasPrice ? BigInt(tx.gasPrice) : 0n,
      maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : null,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas) : null,
      nonce: 0,
      chainId: 0n,
      type: tx.maxFeePerGas ? 2 : (tx.gasPrice ? 0 : null),
      accessList: null,
      blobVersionedHashes: null,
      maxFeePerBlobGas: null,
      signature: ethers.Signature.from({ r: '0x', s: '0x', v: 0 }),
      wait: (confirms?: number) => {
        if (!this.provider) throw new Error('Provider not set');
        return this.provider.waitForTransaction(hash, confirms);
      },
      toJSON: () => ({ hash, from, to: tx.to }),
      blockNumber: receipt?.blockNumber ?? null,
      blockHash: receipt?.blockHash ?? null,
      timestamp: null,
      index: receipt?.index ?? -1,
    } as unknown as ethers.TransactionResponse;

    return txObj;
  }

  override connect(provider: ethers.Provider): WdkSignerAdapter {
    return new WdkSignerAdapter(this._wdkAccount, provider);
  }
}

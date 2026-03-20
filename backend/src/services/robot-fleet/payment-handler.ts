import { ethers } from 'ethers';
import { logger } from '@/utils/logger';

interface PendingTx {
  hash: string;
  nonce: number;
  amount: string;
  to: string;
  timestamp: number;
}

interface TransactionResult {
  hash: string;
  status: 'sent' | 'already_known' | 'receipt_found';
  receipt?: any;
}

export class RobotFleetPaymentHandler {
  private pendingTxs: Map<string, PendingTx> = new Map();
  private nonceCache: Map<string, number> = new Map();
  private readonly ALREADY_KNOWN_PATTERN = /already\s+known|nonce\s+too\s+low/i;
  private readonly TIMEOUT_MS = 120000;
  private readonly MAX_RETRIES = 3;
  private readonly BASE_BACKOFF_MS = 1000;
  private readonly GAS_BUFFER_PERCENT = 50n;
  private readonly FALLBACK_GAS_LIMIT = 100000n;
  private _addressPromise: Promise<string> | null = null;

  constructor(
    private wallet: ethers.Signer,
    private provider: ethers.JsonRpcProvider
  ) {}

  private async getAddress(): Promise<string> {
    if (!this._addressPromise) {
      this._addressPromise = this.wallet.getAddress();
    }
    return this._addressPromise;
  }

  async sendPayment(
    amount: string,
    toAddress: string,
    options?: { gasLimit?: bigint; maxRetries?: number }
  ): Promise<TransactionResult> {
    const maxRetries = options?.maxRetries ?? this.MAX_RETRIES;
    const address = await this.getAddress();

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const balance = await this.provider.getBalance(address);
        const amountWei = ethers.parseEther(amount);

        if (balance < amountWei) {
          throw new Error(
            `Insufficient balance: ${ethers.formatEther(balance)} < ${amount}`
          );
        }

        const nonce = await this.getNonce();

        let gasLimit: bigint;
        if (options?.gasLimit) {
          gasLimit = options.gasLimit;
        } else {
          try {
            const estimated = await this.provider.estimateGas({
              from: address,
              to: toAddress,
              value: amountWei
            });
            gasLimit = estimated + (estimated * this.GAS_BUFFER_PERCENT / 100n);
            logger.debug({ estimated: estimated.toString(), gasLimit: gasLimit.toString() }, '[PaymentHandler] Gas estimated');
          } catch (estimateError: any) {
            logger.warn({ error: estimateError.message }, '[PaymentHandler] Gas estimation failed, using fallback');
            gasLimit = this.FALLBACK_GAS_LIMIT;
          }
        }

        logger.info(
          { amount, to: toAddress, nonce, gasLimit: gasLimit.toString(), attempt: attempt + 1 },
          '[PaymentHandler] Sending transaction'
        );

        const tx = await this.wallet.sendTransaction({
          to: toAddress,
          value: amountWei,
          gasLimit,
          nonce
        });

        this.pendingTxs.set(tx.hash, {
          hash: tx.hash,
          nonce,
          amount,
          to: toAddress,
          timestamp: Date.now()
        });

        logger.info(
          { hash: tx.hash, nonce },
          '[PaymentHandler] Transaction sent'
        );

        return { hash: tx.hash, status: 'sent' };
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        const errorCode = error.code || '';

        if (errorCode === 'TRANSACTION_REPLACED' && error.replacement?.hash) {
          logger.info(
            {
              originalHash: error.hash,
              replacementHash: error.replacement.hash,
              reason: error.reason
            },
            '[PaymentHandler] Transaction was replaced/repriced, using replacement'
          );

          return {
            hash: error.replacement.hash,
            status: 'receipt_found',
            receipt: error.receipt
          };
        }

        const rpcError = error.error || error.info?.error;
        const isNonceError =
          this.ALREADY_KNOWN_PATTERN.test(errorMsg) ||
          errorCode === 'NONCE_EXPIRED' ||
          (rpcError && rpcError.code === -32000) ||
          (rpcError && /already\s+known/i.test(rpcError.message || ''));

        if (isNonceError) {
          logger.warn(
            { error: errorMsg, attempt: attempt + 1 },
            '[PaymentHandler] Transaction already in mempool'
          );

          const existing = await this.findExistingTransaction(
            toAddress,
            amount
          );

          let txHash = existing?.hash;

          if (!txHash) {
            if (error.hash) {
              txHash = error.hash;
              logger.info({ hash: txHash }, '[PaymentHandler] Found hash on error object');
            } else if (error.info?.hash) {
              txHash = error.info.hash;
              logger.info({ hash: txHash }, '[PaymentHandler] Found hash on error.info');
            } else if (error.transaction && typeof error.transaction === 'string') {
              try {
                txHash = ethers.keccak256(error.transaction);
                logger.info(
                  { hash: txHash, txHex: error.transaction.substring(0, 20) + '...' },
                  '[PaymentHandler] Reconstructed hash from error.transaction (raw hex)'
                );
              } catch (reconstructError: any) {
                logger.warn(
                  { error: reconstructError.message },
                  '[PaymentHandler] Could not reconstruct hash from error.transaction'
                );
              }
            } else if (error.transaction?.hash) {
              txHash = error.transaction.hash;
              logger.info({ hash: txHash }, '[PaymentHandler] Found hash on error.transaction.hash');
            } else if (error.payload?.params?.[0]) {
              try {
                const serializedTx = error.payload.params[0];
                txHash = ethers.keccak256(serializedTx);
                logger.info(
                  { hash: txHash, serializedTx: serializedTx.substring(0, 20) + '...' },
                  '[PaymentHandler] Reconstructed tx hash from payload'
                );
              } catch (reconstructError: any) {
                logger.warn(
                  { error: reconstructError.message },
                  '[PaymentHandler] Could not reconstruct tx hash from payload'
                );
              }
            } else if (error.info?.payload?.params?.[0]) {
              try {
                const serializedTx = error.info.payload.params[0];
                txHash = ethers.keccak256(serializedTx);
                logger.info(
                  { hash: txHash, serializedTx: serializedTx.substring(0, 20) + '...' },
                  '[PaymentHandler] Reconstructed tx hash from info.payload'
                );
              } catch (reconstructError: any) {
                logger.warn(
                  { error: reconstructError.message },
                  '[PaymentHandler] Could not reconstruct tx hash from info.payload'
                );
              }
            }
          }

          if (!txHash) {
            const errorKeys = Object.keys(error).join(', ');
            logger.error(
              { errorKeys, errorMsg: error.message, errorCode: error.code },
              '[PaymentHandler] Failed to identify hash in "already known" error'
            );
            throw new Error(
              `[PaymentHandler] Transaction already in mempool but could not identify hash`
            );
          }

          logger.info(
            { hash: txHash },
            '[PaymentHandler] Found existing transaction in mempool'
          );

          try {
            const receipt = await this.provider.waitForTransaction(
              txHash,
              1,
              this.TIMEOUT_MS
            );
            if (receipt) {
              logger.info(
                { hash: txHash, blockNumber: receipt.blockNumber },
                '[PaymentHandler] Existing transaction confirmed'
              );
              return {
                hash: txHash,
                status: 'receipt_found',
                receipt
              };
            }
          } catch (waitError: any) {
            logger.warn(
              { hash: txHash, error: waitError.message },
              '[PaymentHandler] Could not wait for existing transaction receipt'
            );
            return {
              hash: txHash,
              status: 'already_known'
            };
          }

          throw new Error(
            `[PaymentHandler] Unexpected state after handling "already known" error`
          );
        }

        if (attempt === maxRetries - 1) {
          logger.error(
            { error: errorMsg, attempts: attempt + 1 },
            '[PaymentHandler] Transaction failed after retries'
          );
          throw error;
        }

        if (this.isTransientError(error)) {
          const backoffMs = this.BASE_BACKOFF_MS * Math.pow(2, attempt);
          logger.warn(
            { error: errorMsg, backoffMs },
            '[PaymentHandler] Transient error, retrying'
          );
          await this.sleep(backoffMs);
          this.nonceCache.delete(address);
          continue;
        }

        throw error;
      }
    }

    throw new Error(
      '[PaymentHandler] Failed to send transaction after max retries'
    );
  }

  private async findExistingTransaction(
    toAddress: string,
    amount: string
  ): Promise<{ hash: string } | null> {
    for (const [hash, tx] of this.pendingTxs) {
      if (
        tx.to.toLowerCase() === toAddress.toLowerCase() &&
        tx.amount === amount
      ) {
        const receipt = await this.provider.getTransactionReceipt(hash);
        if (!receipt) {
          return { hash };
        } else if (receipt.blockNumber) {
          logger.info(
            { hash, blockNumber: receipt.blockNumber },
            '[PaymentHandler] Found mined transaction'
          );
          return { hash };
        }
      }
    }

    return null;
  }

  private async getNonce(): Promise<number> {
    const key = await this.getAddress();
    const cached = this.nonceCache.get(key);

    if (cached !== undefined) {
      const nonce = cached + 1;
      this.nonceCache.set(key, nonce);
      return nonce;
    }

    const nonce = await this.provider.getTransactionCount(key);
    this.nonceCache.set(key, nonce);
    return nonce;
  }

  private isTransientError(error: any): boolean {
    const msg = (error.message || String(error)).toLowerCase();
    return (
      msg.includes('timeout') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('429') ||
      msg.includes('rate limit') ||
      msg.includes('temporarily unavailable')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  cleanupOldTransactions(ageMs: number = 600000): void {
    const now = Date.now();
    for (const [hash, tx] of this.pendingTxs) {
      if (now - tx.timestamp > ageMs) {
        this.pendingTxs.delete(hash);
        logger.debug(
          { hash, age: now - tx.timestamp },
          '[PaymentHandler] Cleaned up old transaction'
        );
      }
    }
  }

  getPendingCount(): number {
    return this.pendingTxs.size;
  }
}

let instance: RobotFleetPaymentHandler | null = null;

export function initPaymentHandler(
  wallet: ethers.Signer,
  provider: ethers.JsonRpcProvider
): RobotFleetPaymentHandler {
  instance = new RobotFleetPaymentHandler(wallet, provider);
  logger.info('[PaymentHandler] Initialized');
  return instance;
}

export function getPaymentHandler(): RobotFleetPaymentHandler {
  if (!instance) {
    throw new Error(
      '[PaymentHandler] Not initialized. Call initPaymentHandler first.'
    );
  }
  return instance;
}

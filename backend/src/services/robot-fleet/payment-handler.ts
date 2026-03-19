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

/**
 * Idempotent payment handler for robot fleet
 * Handles "already known" errors gracefully by:
 * 1. Detecting when transaction already exists in mempool
 * 2. Waiting for existing transaction to complete
 * 3. Managing nonces to prevent duplicates
 * 4. Implementing exponential backoff retry
 */
export class RobotFleetPaymentHandler {
  private pendingTxs: Map<string, PendingTx> = new Map();
  private nonceCache: Map<string, number> = new Map();
  private readonly ALREADY_KNOWN_PATTERN = /already\s+known|nonce\s+too\s+low/i;
  private readonly TIMEOUT_MS = 120000; // 2 minutes
  private readonly MAX_RETRIES = 3;
  private readonly BASE_BACKOFF_MS = 1000;
  private readonly GAS_BUFFER_PERCENT = 50n;
  private readonly FALLBACK_GAS_LIMIT = 100000n;

  constructor(
    private wallet: ethers.Wallet,
    private provider: ethers.JsonRpcProvider
  ) {}

  /**
   * Send payment idempotently
   * Returns existing tx if "already known" error occurs
   */
  async sendPayment(
    amount: string,
    toAddress: string,
    options?: { gasLimit?: bigint; maxRetries?: number }
  ): Promise<TransactionResult> {
    const maxRetries = options?.maxRetries ?? this.MAX_RETRIES;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Check if sufficient balance
        const balance = await this.provider.getBalance(this.wallet.address);
        const amountWei = ethers.parseEther(amount);

        if (balance < amountWei) {
          throw new Error(
            `Insufficient balance: ${ethers.formatEther(balance)} < ${amount}`
          );
        }

        // Get current nonce
        const nonce = await this.getNonce();

        let gasLimit: bigint;
        if (options?.gasLimit) {
          gasLimit = options.gasLimit;
        } else {
          try {
            const estimated = await this.provider.estimateGas({
              from: this.wallet.address,
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

        // Cache the pending transaction
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

        // Handle TRANSACTION_REPLACED error (repriced/accelerated transaction)
        // When ethers.js detects a transaction was replaced with a higher gas price, 
        // it provides the replacement transaction hash and receipt
        if (errorCode === 'TRANSACTION_REPLACED' && error.replacement?.hash) {
          logger.info(
            { 
              originalHash: error.hash, 
              replacementHash: error.replacement.hash,
              reason: error.reason 
            },
            '[PaymentHandler] Transaction was replaced/repriced, using replacement'
          );
          
          // The replacement transaction has been confirmed on-chain, return it gracefully
          return {
            hash: error.replacement.hash,
            status: 'receipt_found',
            receipt: error.receipt
          };
        }

        // Handle "already known" error (ethers uses NONCE_EXPIRED code for -32000 RPC errors)
        // Error structure in ethers v6: { code: 'UNKNOWN_ERROR', error: { code: -32000, message: 'already known' } }
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

          // Try to find the existing transaction
          const existing = await this.findExistingTransaction(
            toAddress,
            amount
          );
          
          let txHash = existing?.hash;
          
          // If not found in pendingTxs, try various methods to extract hash
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
          
          // If we still don't have a hash, we can't proceed
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
          
          // Wait for the existing transaction to complete
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
            // Return hash even if receipt not available yet
            return {
              hash: txHash,
              status: 'already_known'
            };
          }
          
          // Should not reach here
          throw new Error(
            `[PaymentHandler] Unexpected state after handling "already known" error`
          );
        }

        // Non-recoverable error or max retries exceeded (for non-nonce errors)
        if (attempt === maxRetries - 1) {
          logger.error(
            { error: errorMsg, attempts: attempt + 1 },
            '[PaymentHandler] Transaction failed after retries'
          );
          throw error;
        }

        // Retry other transient errors
        if (this.isTransientError(error)) {
          const backoffMs = this.BASE_BACKOFF_MS * Math.pow(2, attempt);
          logger.warn(
            { error: errorMsg, backoffMs },
            '[PaymentHandler] Transient error, retrying'
          );
          await this.sleep(backoffMs);
          this.nonceCache.delete(this.wallet.address);
          continue;
        }

        throw error;
      }
    }

    throw new Error(
      '[PaymentHandler] Failed to send transaction after max retries'
    );
  }

  /**
   * Try to find existing transaction in mempool
   */
  private async findExistingTransaction(
    toAddress: string,
    amount: string
  ): Promise<{ hash: string } | null> {
    // Check pending transactions we've tracked
    for (const [hash, tx] of this.pendingTxs) {
      if (
        tx.to.toLowerCase() === toAddress.toLowerCase() &&
        tx.amount === amount
      ) {
        // Verify it's still pending (not mined yet)
        const receipt = await this.provider.getTransactionReceipt(hash);
        if (!receipt) {
          return { hash };
        } else if (receipt.blockNumber) {
          // Transaction mined, return receipt info
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

  /**
   * Get nonce with caching and invalidation on error
   */
  private async getNonce(): Promise<number> {
    const key = this.wallet.address;
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

  /**
   * Check if error is transient (retryable)
   */
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

  /**
   * Clean up old pending transactions
   */
  cleanupOldTransactions(ageMs: number = 600000): void {
    // 10 minutes default
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

  /**
   * Get pending transactions count
   */
  getPendingCount(): number {
    return this.pendingTxs.size;
  }
}

/**
 * Singleton instance
 */
let instance: RobotFleetPaymentHandler | null = null;

export function initPaymentHandler(
  wallet: ethers.Wallet,
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

import { logger } from '@/utils/logger';
import { TransactionInput, FinalOutcome, PipelineResult } from './GovernancePipeline';

export interface ApprovalRequest {
  reviewId: string;
  transaction: TransactionInput;
  pipelineResult: PipelineResult;
  requestedAt: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  reviewedBy?: string;
  reviewedAt?: number;
  comment?: string;
}

export class ApprovalHandler {
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private approvalTimeoutMs: number = 24 * 60 * 60 * 1000;

  async createApprovalRequest(
    transaction: TransactionInput,
    pipelineResult: PipelineResult
  ): Promise<ApprovalRequest> {
    const reviewId = this.generateReviewId();

    const request: ApprovalRequest = {
      reviewId,
      transaction,
      pipelineResult,
      requestedAt: Date.now(),
      status: 'pending'
    };

    this.pendingApprovals.set(reviewId, request);

    logger.info({ reviewId, transaction, outcome: pipelineResult.outcome }, '[ApprovalHandler] Created approval request');

    return request;
  }

  async approve(reviewId: string, reviewer: string, comment?: string): Promise<boolean> {
    const request = this.pendingApprovals.get(reviewId);

    if (!request) {
      logger.warn({ reviewId }, '[ApprovalHandler] Approval request not found');
      return false;
    }

    if (request.status !== 'pending') {
      logger.warn({ reviewId, status: request.status }, '[ApprovalHandler] Request already processed');
      return false;
    }

    if (this.isExpired(request)) {
      request.status = 'expired';
      logger.warn({ reviewId }, '[ApprovalHandler] Request expired');
      return false;
    }

    request.status = 'approved';
    request.reviewedBy = reviewer;
    request.reviewedAt = Date.now();
    request.comment = comment;

    logger.info({ reviewId, reviewer }, '[ApprovalHandler] Request approved');
    return true;
  }

  async reject(reviewId: string, reviewer: string, comment?: string): Promise<boolean> {
    const request = this.pendingApprovals.get(reviewId);

    if (!request) {
      logger.warn({ reviewId }, '[ApprovalHandler] Approval request not found');
      return false;
    }

    if (request.status !== 'pending') {
      logger.warn({ reviewId, status: request.status }, '[ApprovalHandler] Request already processed');
      return false;
    }

    request.status = 'rejected';
    request.reviewedBy = reviewer;
    request.reviewedAt = Date.now();
    request.comment = comment;

    logger.info({ reviewId, reviewer }, '[ApprovalHandler] Request rejected');
    return true;
  }

  getApprovalRequest(reviewId: string): ApprovalRequest | null {
    return this.pendingApprovals.get(reviewId) || null;
  }

  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values())
      .filter(r => r.status === 'pending' && !this.isExpired(r));
  }

  getAllApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values());
  }

  private isExpired(request: ApprovalRequest): boolean {
    return Date.now() - request.requestedAt > this.approvalTimeoutMs;
  }

  cleanupExpired(): number {
    let cleaned = 0;
    for (const [reviewId, request] of this.pendingApprovals.entries()) {
      if (this.isExpired(request) && request.status === 'pending') {
        request.status = 'expired';
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.info({ cleaned }, '[ApprovalHandler] Cleaned up expired requests');
    }
    return cleaned;
  }

  setApprovalTimeout(timeoutMs: number): void {
    this.approvalTimeoutMs = timeoutMs;
  }

  private generateReviewId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `review_${timestamp}_${random}`;
  }
}

let globalApprovalHandler: ApprovalHandler | null = null;

export function getApprovalHandler(): ApprovalHandler {
  if (!globalApprovalHandler) {
    globalApprovalHandler = new ApprovalHandler();
  }
  return globalApprovalHandler;
}

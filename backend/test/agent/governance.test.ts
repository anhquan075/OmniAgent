import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApprovalHandler, ApprovalRequest, getApprovalHandler } from '../../src/agent/services/ApprovalHandler';
import { FinalOutcome, TransactionInput } from '../../src/agent/services/GovernancePipeline';

describe('GovernancePipeline', () => {
  describe('FinalOutcome enum', () => {
    it('should have correct values', () => {
      expect(FinalOutcome.AUTO_APPROVE).toBe('auto_approve');
      expect(FinalOutcome.FLAG_FOR_REVIEW).toBe('flag_for_review');
      expect(FinalOutcome.REJECT).toBe('reject');
    });
  });

  describe('TransactionInput interface', () => {
    it('should accept valid transaction input', () => {
      const input: TransactionInput = {
        toAddress: '0x1234567890123456789012345678901234567890',
        amount: '1000000',
        transactionType: 'transfer'
      };

      expect(input.toAddress).toBeDefined();
      expect(input.amount).toBeDefined();
      expect(input.transactionType).toBe('transfer');
    });
  });
});

describe('ApprovalHandler', () => {
  let handler: ApprovalHandler;

  beforeEach(() => {
    handler = new ApprovalHandler();
  });

  describe('createApprovalRequest', () => {
    it('should create approval request with reviewId', async () => {
      const transaction: TransactionInput = {
        toAddress: '0x1234567890123456789012345678901234567890',
        amount: '1000000',
        transactionType: 'transfer'
      };

      const pipelineResult = {
        outcome: FinalOutcome.FLAG_FOR_REVIEW,
        layers: {
          rules: { passed: true },
          anomaly: { isAnomaly: true, reason: 'Test anomaly', confidence: 'high' },
          ai: { riskScore: 75, explanation: 'High risk' }
        },
        flagReason: 'Test flag'
      };

      const request = await handler.createApprovalRequest(transaction, pipelineResult);

      expect(request.reviewId).toBeDefined();
      expect(request.reviewId).toMatch(/^review_/);
      expect(request.transaction).toEqual(transaction);
      expect(request.pipelineResult).toEqual(pipelineResult);
      expect(request.status).toBe('pending');
    });
  });

  describe('approve', () => {
    it('should approve pending request', async () => {
      const transaction: TransactionInput = {
        toAddress: '0x1234567890123456789012345678901234567890',
        amount: '1000000',
        transactionType: 'transfer'
      };

      const request = await handler.createApprovalRequest(transaction, {
        outcome: FinalOutcome.FLAG_FOR_REVIEW,
        layers: { rules: { passed: true }, anomaly: { isAnomaly: false, reason: '', confidence: 'high' }, ai: { riskScore: 50, explanation: '' } },
        flagReason: 'Test'
      });

      const approved = await handler.approve(request.reviewId, 'reviewer1', 'LGTM');

      expect(approved).toBe(true);
      const updated = handler.getApprovalRequest(request.reviewId);
      expect(updated?.status).toBe('approved');
      expect(updated?.reviewedBy).toBe('reviewer1');
      expect(updated?.comment).toBe('LGTM');
    });

    it('should reject already processed request', async () => {
      const transaction: TransactionInput = {
        toAddress: '0x1234567890123456789012345678901234567890',
        amount: '1000000',
        transactionType: 'transfer'
      };

      const request = await handler.createApprovalRequest(transaction, {
        outcome: FinalOutcome.FLAG_FOR_REVIEW,
        layers: { rules: { passed: true }, anomaly: { isAnomaly: false, reason: '', confidence: 'high' }, ai: { riskScore: 50, explanation: '' } },
        flagReason: 'Test'
      });

      await handler.approve(request.reviewId, 'reviewer1');
      const secondApprove = await handler.approve(request.reviewId, 'reviewer2');

      expect(secondApprove).toBe(false);
    });
  });

  describe('reject', () => {
    it('should reject pending request', async () => {
      const transaction: TransactionInput = {
        toAddress: '0x1234567890123456789012345678901234567890',
        amount: '1000000',
        transactionType: 'transfer'
      };

      const request = await handler.createApprovalRequest(transaction, {
        outcome: FinalOutcome.FLAG_FOR_REVIEW,
        layers: { rules: { passed: true }, anomaly: { isAnomaly: false, reason: '', confidence: 'high' }, ai: { riskScore: 50, explanation: '' } },
        flagReason: 'Test'
      });

      const rejected = await handler.reject(request.reviewId, 'reviewer1', 'Risky');

      expect(rejected).toBe(true);
      const updated = handler.getApprovalRequest(request.reviewId);
      expect(updated?.status).toBe('rejected');
    });
  });

  describe('getPendingApprovals', () => {
    it('should return only pending requests', async () => {
      const transaction: TransactionInput = {
        toAddress: '0x1234567890123456789012345678901234567890',
        amount: '1000000',
        transactionType: 'transfer'
      };

      const pipelineResult = {
        outcome: FinalOutcome.FLAG_FOR_REVIEW,
        layers: { rules: { passed: true }, anomaly: { isAnomaly: false, reason: '', confidence: 'high' }, ai: { riskScore: 50, explanation: '' } },
        flagReason: 'Test'
      };

      const request1 = await handler.createApprovalRequest(transaction, pipelineResult);
      await handler.createApprovalRequest(transaction, pipelineResult);
      
      await handler.approve(request1.reviewId, 'reviewer1');

      const pending = handler.getPendingApprovals();
      expect(pending.length).toBe(1);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const handler1 = getApprovalHandler();
      const handler2 = getApprovalHandler();
      expect(handler1).toBe(handler2);
    });
  });
});

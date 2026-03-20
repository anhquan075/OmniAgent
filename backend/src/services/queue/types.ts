/**
 * Queue Types for Decoupled Scanner/Agent Architecture
 * 
 * Market Scanner publishes opportunities to queue
 * Agent consumes and executes profitable opportunities
 */

export interface MarketOpportunity {
  id: string;
  timestamp: number;
  pair: string;
  buyExchange: string;
  sellExchange: string;
  spreadBps: number;
  spreadPercent: number;
  volumeUsd: number;
  gasEstimate: number;
  gasPriceGwei: number;
  ethPriceUsd: number;
  buyFeeBps: number;
  sellFeeBps: number;
  slippageBps: number;
  netProfitUsd: number;
  recommendation: 'EXECUTE' | 'SKIP' | 'WAIT';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface QueueConfig {
  redisUrl?: string;
  queueName: string;
  maxQueueSize: number;
  ttlMs: number;
  deadLetterQueue?: string;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  deadLetter: number;
}

export type QueueStatus = 'idle' | 'running' | 'paused' | 'error';

export interface QueueMessage<T> {
  id: string;
  data: T;
  timestamp: number;
  retries: number;
  maxRetries: number;
  priority: number;
}
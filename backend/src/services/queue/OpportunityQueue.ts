import { EventEmitter } from 'events';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import type { MarketOpportunity, QueueConfig, QueueStats, QueueStatus, QueueMessage } from './types';

let Redis: any = null;
try {
  Redis = require('ioredis');
} catch {
  // ioredis not installed, fallback to in-memory
}

type RedisClient = InstanceType<typeof Redis> | null;

export interface OpportunityHandler {
  (opportunity: MarketOpportunity): Promise<void>;
}

export class OpportunityQueue extends EventEmitter {
  private config: QueueConfig;
  private redis: RedisClient = null;
  private status: QueueStatus = 'idle';
  private handlers: Map<string, OpportunityHandler[]> = new Map();
  private processingInterval: NodeJS.Timeout | null = null;
  
  private inMemoryQueue: QueueMessage<MarketOpportunity>[] = [];
  private inMemoryDeadLetter: QueueMessage<MarketOpportunity>[] = [];
  private inMemoryStats = { completed: 0, failed: 0 };
  
  private readonly QUEUE_KEY: string;
  private readonly PROCESSING_KEY: string;
  private readonly COMPLETED_KEY: string;
  private readonly FAILED_KEY: string;
  private readonly DEAD_LETTER_KEY: string;

  constructor(config: Partial<QueueConfig> = {}) {
    super();
    this.config = {
      redisUrl: config.redisUrl || env.REDIS_URL,
      queueName: config.queueName || 'market-opportunities',
      maxQueueSize: config.maxQueueSize || 1000,
      ttlMs: config.ttlMs || 300000, // 5 minutes
      deadLetterQueue: config.deadLetterQueue || 'market-opportunities-dlq',
    };
    
    this.QUEUE_KEY = `${this.config.queueName}:pending`;
    this.PROCESSING_KEY = `${this.config.queueName}:processing`;
    this.COMPLETED_KEY = `${this.config.queueName}:completed`;
    this.FAILED_KEY = `${this.config.queueName}:failed`;
    this.DEAD_LETTER_KEY = this.config.deadLetterQueue || 'dlq';
    
    this.initRedis();
  }

  private async initRedis(): Promise<void> {
    if (!this.config.redisUrl || !Redis) {
      logger.info('[OpportunityQueue] Using in-memory queue (Redis not configured)');
      this.status = 'running';
      return;
    }

    try {
      this.redis = new Redis(this.config.redisUrl, {
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 1000,
        lazyConnect: true,
      });
      
      await this.redis.ping();
      this.status = 'running';
      logger.info({ queue: this.config.queueName }, '[OpportunityQueue] Connected to Redis');
    } catch (error) {
      logger.warn({ error }, '[OpportunityQueue] Redis connection failed, using in-memory fallback');
      this.redis = null;
      this.status = 'running';
    }
  }

  async publish(opportunity: MarketOpportunity): Promise<void> {
    const message: QueueMessage<MarketOpportunity> = {
      id: `${opportunity.id}-${Date.now()}`,
      data: opportunity,
      timestamp: Date.now(),
      retries: 0,
      maxRetries: 3,
      priority: opportunity.priority === 'HIGH' ? 1 : opportunity.priority === 'MEDIUM' ? 2 : 3,
    };

    if (this.redis) {
      await this.redis.lpush(this.QUEUE_KEY, JSON.stringify(message));
    } else {
      if (this.inMemoryQueue.length >= this.config.maxQueueSize) {
        this.inMemoryQueue.shift();
      }
      this.inMemoryQueue.push(message);
      this.inMemoryQueue.sort((a, b) => a.priority - b.priority);
    }
    
    this.emit('opportunity', opportunity);
    logger.debug({ id: message.id, pair: opportunity.pair }, '[OpportunityQueue] Published opportunity');
  }

  async subscribe(handler: OpportunityHandler): Promise<void> {
    const id = `handler-${Date.now()}`;
    if (!this.handlers.has(id)) {
      this.handlers.set(id, []);
    }
    this.handlers.get(id)!.push(handler);
    
    if (!this.processingInterval) {
      this.startProcessing();
    }
  }

  private startProcessing(): void {
    this.processingInterval = setInterval(async () => {
      const message = await this.dequeue();
      if (message) {
        await this.processMessage(message);
      }
    }, 100);
    
    this.on('opportunity', async (opp: MarketOpportunity) => {
      if (opp.recommendation === 'EXECUTE') {
        const message: QueueMessage<MarketOpportunity> = {
          id: opp.id,
          data: opp,
          timestamp: Date.now(),
          retries: 0,
          maxRetries: 3,
          priority: opp.priority === 'HIGH' ? 1 : 2,
        };
        await this.processMessage(message);
      }
    });
  }

  private async dequeue(): Promise<QueueMessage<MarketOpportunity> | null> {
    if (this.redis) {
      const data = await this.redis.rpoplpush(this.QUEUE_KEY, this.PROCESSING_KEY);
      if (data) {
        return JSON.parse(data);
      }
      return null;
    }

    if (this.inMemoryQueue.length === 0) {
      return null;
    }
    
    const message = this.inMemoryQueue.shift()!;
    return message;
  }

  private async processMessage(message: QueueMessage<MarketOpportunity>): Promise<void> {
    const handlers = Array.from(this.handlers.values()).flat();
    
    try {
      for (const handler of handlers) {
        await handler(message.data);
      }
      
      if (this.redis) {
        await this.redis.lrem(this.PROCESSING_KEY, 1, JSON.stringify(message));
        await this.redis.incr(this.COMPLETED_KEY);
      } else {
        this.inMemoryStats.completed++;
      }
      
      logger.debug({ id: message.id }, '[OpportunityQueue] Opportunity processed successfully');
    } catch (error) {
      message.retries++;
      
      if (this.redis) {
        await this.redis.lrem(this.PROCESSING_KEY, 1, JSON.stringify(message));
        
        if (message.retries < message.maxRetries) {
          await this.redis.lpush(this.QUEUE_KEY, JSON.stringify(message));
        } else {
          await this.redis.lpush(this.DEAD_LETTER_KEY, JSON.stringify(message));
          await this.redis.incr(this.FAILED_KEY);
        }
      } else {
        if (message.retries < message.maxRetries) {
          this.inMemoryQueue.push(message);
        } else {
          this.inMemoryDeadLetter.push(message);
          this.inMemoryStats.failed++;
        }
      }
      
      logger.warn({ id: message.id, retries: message.retries, error }, '[OpportunityQueue] Opportunity processing failed');
    }
  }

  async getStats(): Promise<QueueStats> {
    if (this.redis) {
      const [pending, processing, completed, failed, deadLetter] = await Promise.all([
        this.redis.llen(this.QUEUE_KEY),
        this.redis.llen(this.PROCESSING_KEY),
        this.redis.get(this.COMPLETED_KEY).then((v: string) => parseInt(v || '0')),
        this.redis.get(this.FAILED_KEY).then((v: string) => parseInt(v || '0')),
        this.redis.llen(this.DEAD_LETTER_KEY),
      ]);
      
      return { pending, processing, completed, failed, deadLetter };
    }
    
    return {
      pending: this.inMemoryQueue.length,
      processing: 0,
      completed: this.inMemoryStats.completed,
      failed: this.inMemoryStats.failed,
      deadLetter: this.inMemoryDeadLetter.length,
    };
  }

  getStatus(): QueueStatus {
    return this.status;
  }

  async pause(): Promise<void> {
    this.status = 'paused';
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    logger.info('[OpportunityQueue] Queue paused');
  }

  async resume(): Promise<void> {
    this.status = 'running';
    if (!this.processingInterval) {
      this.startProcessing();
    }
    logger.info('[OpportunityQueue] Queue resumed');
  }

  async close(): Promise<void> {
    await this.pause();
    if (this.redis) {
      await this.redis.quit();
    }
    this.status = 'idle';
    logger.info('[OpportunityQueue] Queue closed');
  }

  async getDeadLetterQueue(): Promise<QueueMessage<MarketOpportunity>[]> {
    if (this.redis) {
      const items = await this.redis.lrange(this.DEAD_LETTER_KEY, 0, -1);
      return items.map((item: string) => JSON.parse(item));
    }
    return this.inMemoryDeadLetter;
  }

  async reprocessFromDLQ(messageId?: string): Promise<void> {
    const dlq = await this.getDeadLetterQueue();
    const toReprocess = messageId 
      ? dlq.filter(m => m.id === messageId)
      : dlq;
    
    for (const message of toReprocess) {
      message.retries = 0;
      await this.publish(message.data);
      
      if (this.redis) {
        await this.redis.lrem(this.DEAD_LETTER_KEY, 1, JSON.stringify(message));
      } else {
        const idx = this.inMemoryDeadLetter.findIndex(m => m.id === message.id);
        if (idx >= 0) {
          this.inMemoryDeadLetter.splice(idx, 1);
        }
      }
    }
    
    logger.info({ count: toReprocess.length }, '[OpportunityQueue] Reprocessed from DLQ');
  }
}

let globalQueue: OpportunityQueue | null = null;

export function getOpportunityQueue(config?: Partial<QueueConfig>): OpportunityQueue {
  if (!globalQueue) {
    globalQueue = new OpportunityQueue(config);
  }
  return globalQueue;
}

export function closeQueue(): Promise<void> {
  if (globalQueue) {
    return globalQueue.close();
  }
  return Promise.resolve();
}
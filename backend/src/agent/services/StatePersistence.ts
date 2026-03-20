import { logger } from '@/utils/logger';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface DurableAgentState {
  lastAction: string;
  lastActionTime: number;
  consecutiveFailures: number;
  totalSuppliedUsdt: string;
  totalSuppliedXaut: string;
  totalWithdrawnUsdt: string;
  totalWithdrawnXaut: string;
  healthFactor: string;
  previousHealthFactor: string;
  healthFactorVelocity: number;
  marketCondition: string;
  strategy: string;
  circuitBreakerActive: boolean;
  lastCircuitBreakerTime: number;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_STATE: DurableAgentState = {
  lastAction: 'init',
  lastActionTime: Date.now(),
  consecutiveFailures: 0,
  totalSuppliedUsdt: '0',
  totalSuppliedXaut: '0',
  totalWithdrawnUsdt: '0',
  totalWithdrawnXaut: '0',
  healthFactor: '0',
  previousHealthFactor: '0',
  healthFactorVelocity: 0,
  marketCondition: 'neutral',
  strategy: 'hold',
  circuitBreakerActive: false,
  lastCircuitBreakerTime: 0,
  createdAt: Date.now(),
  updatedAt: Date.now()
};

export class StatePersistence {
  private statePath: string;
  private state: DurableAgentState;
  private dirty: boolean = false;

  constructor(statePath?: string) {
    this.statePath = statePath || join(process.cwd(), '.agent-state', 'state.json');
    this.state = this.load();
  }

  private load(): DurableAgentState {
    try {
      if (existsSync(this.statePath)) {
        const data = readFileSync(this.statePath, 'utf-8');
        const parsed = JSON.parse(data);
        logger.info({ statePath: this.statePath }, '[StatePersistence] Loaded state from disk');
        return { ...DEFAULT_STATE, ...parsed, updatedAt: Date.now() };
      }
    } catch (error) {
      logger.warn({ error, statePath: this.statePath }, '[StatePersistence] Failed to load state, using defaults');
    }
    return { ...DEFAULT_STATE };
  }

  save(): void {
    if (!this.dirty) return;

    try {
      const dir = join(this.statePath, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      
      this.state.updatedAt = Date.now();
      writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
      this.dirty = false;
      logger.debug({ statePath: this.statePath }, '[StatePersistence] State saved to disk');
    } catch (error) {
      logger.error({ error, statePath: this.statePath }, '[StatePersistence] Failed to save state');
    }
  }

  get(): DurableAgentState {
    return { ...this.state };
  }

  update(updates: Partial<DurableAgentState>): void {
    this.state = { ...this.state, ...updates, updatedAt: Date.now() };
    this.dirty = true;
  }

  set(key: keyof DurableAgentState, value: any): void {
    (this.state as any)[key] = value;
    this.dirty = true;
  }

  getKey<K extends keyof DurableAgentState>(key: K): DurableAgentState[K] {
    return this.state[key];
  }

  incrementFailures(): void {
    this.state.consecutiveFailures++;
    this.dirty = true;
  }

  resetFailures(): void {
    this.state.consecutiveFailures = 0;
    this.dirty = true;
  }

  updateHealthFactor(current: bigint, previous: bigint): void {
    this.state.previousHealthFactor = previous.toString();
    this.state.healthFactor = current.toString();
    this.dirty = true;
  }

  recordAction(action: string): void {
    this.state.lastAction = action;
    this.state.lastActionTime = Date.now();
    this.dirty = true;
  }

  isStale(maxAgeMs: number = 24 * 60 * 60 * 1000): boolean {
    return Date.now() - this.state.updatedAt > maxAgeMs;
  }

  reset(): void {
    this.state = { ...DEFAULT_STATE, createdAt: Date.now(), updatedAt: Date.now() };
    this.dirty = true;
  }

  getStateSummary(): {
    isHealthy: boolean;
    lastAction: string;
    timeSinceLastAction: number;
    consecutiveFailures: number;
    healthFactor: string;
    stale: boolean;
  } {
    const now = Date.now();
    return {
      isHealthy: this.state.consecutiveFailures < 3 && !this.state.circuitBreakerActive,
      lastAction: this.state.lastAction,
      timeSinceLastAction: now - this.state.lastActionTime,
      consecutiveFailures: this.state.consecutiveFailures,
      healthFactor: this.state.healthFactor,
      stale: this.isStale()
    };
  }
}

let globalPersistence: StatePersistence | null = null;

export function getStatePersistence(statePath?: string): StatePersistence {
  if (!globalPersistence) {
    globalPersistence = new StatePersistence(statePath);
  }
  return globalPersistence;
}

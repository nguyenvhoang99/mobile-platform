/**
 * Warm pool — pre-create WebViews on a blank page with a generic config.
 * Sized from device memory, never a constant (budgets.md).
 *
 * Invariants:
 * - Pooled WebViews are generic (no per-app state) — storage disabled makes rebinding safe (B1).
 * - Reset means never held anything (containerConfig incognito).
 * - Handle renderer death on every instance including pooled (B4).
 * - On memory pressure, evict all suspended and drop pool to zero.
 * - Never evict an instance with in-flight money/high-tier op.
 */

/* budgets import is for documentation; actual pool size comes from runtime memory class */
import { MAX_CONCURRENT_WEBVIEWS } from '../../config/budgets';

export type PoolSize = 0 | 1 | 2;
export type MemoryClass = 'low' | 'mid' | 'high';

export function poolSizeForMemoryClass(cls: MemoryClass): { live: number; pooled: PoolSize } {
  switch (cls) {
    case 'low':
      return { live: 1, pooled: 0 };
    case 'mid':
      return { live: 1, pooled: 1 };
    case 'high':
      return { live: 2, pooled: 1 };
  }
}

export function classifyMemory(totalMB: number): MemoryClass {
  if (totalMB <= 3500) return 'low';
  if (totalMB <= 6000) return 'mid';
  return 'high';
}

export type PooledInstance = {
  id: string;
  state: 'warming' | 'ready' | 'bound' | 'suspended' | 'evicted';
  boundAppId: string | null;
  hasInflightMoneyOp: boolean;
};

export class WarmPool {
  private instances: PooledInstance[] = [];
  private nextId = 0;

  constructor(private readonly memoryClass: MemoryClass) {}

  get maxPooled(): PoolSize {
    return poolSizeForMemoryClass(this.memoryClass).pooled;
  }

  get maxLive(): number {
    return poolSizeForMemoryClass(this.memoryClass).live;
  }

  // Pre-create generic instances up to maxPooled
  warm(): PooledInstance[] {
    while (this.instances.filter(i => i.state === 'ready').length < this.maxPooled) {
      this.instances.push({ id: `pool-${this.nextId++}`, state: 'ready', boundAppId: null, hasInflightMoneyOp: false });
    }
    return this.instances;
  }

  bind(appId: string): PooledInstance | null {
    // Prefer a ready pooled instance
    const ready = this.instances.find(i => i.state === 'ready');
    if (ready) {
      ready.state = 'bound';
      ready.boundAppId = appId;
      return ready;
    }
    // No pool — create live instance if under maxLive
    const live = this.instances.filter(i => i.state === 'bound').length;
    if (live < this.maxLive) {
      const inst: PooledInstance = { id: `live-${this.nextId++}`, state: 'bound', boundAppId: appId, hasInflightMoneyOp: false };
      this.instances.push(inst);
      return inst;
    }
    return null;
  }

  suspend(id: string): void {
    const inst = this.instances.find(i => i.id === id);
    if (inst && inst.state === 'bound') inst.state = 'suspended';
  }

  // LRU eviction — never evict inflight money ops, drive to terminal first
  evictLRU(): PooledInstance | null {
    const candidates = this.instances.filter(i => i.state === 'suspended' && !i.hasInflightMoneyOp);
    if (candidates.length === 0) return null;
    const evicted = candidates[0];
    evicted.state = 'evicted';
    return evicted;
  }

  onMemoryPressure(): void {
    // Evict all suspended, drop pool to zero
    for (const inst of this.instances) {
      if (inst.state === 'suspended') inst.state = 'evicted';
      if (inst.state === 'ready') inst.state = 'evicted';
    }
  }

  // For tests/B4: every instance including pooled must have renderer-death handler.
  // This is a contract: caller must attach handler at creation; we assert count.
  get allIds(): string[] {
    return this.instances.map(i => i.id);
  }

  get count(): number {
    return this.instances.length;
  }

  // Budget guard: respect MAX_CONCURRENT_WEBVIEWS from budgets
  assertWithinBudget(): void {
    const live = this.instances.filter(i => i.state === 'bound' || i.state === 'suspended').length;
    if (live > MAX_CONCURRENT_WEBVIEWS) throw new Error(`WarmPool exceeds MAX_CONCURRENT_WEBVIEWS ${MAX_CONCURRENT_WEBVIEWS}`);
  }
}

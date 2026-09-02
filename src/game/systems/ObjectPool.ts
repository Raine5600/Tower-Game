/**
 * Generic object pool. Avoids per-frame GC churn from allocating/destroying
 * projectiles, floating text, and particle-adjacent sprites — the #1 perf
 * recommendation for canvas/WebGL games under sustained spawn pressure.
 */
export class ObjectPool<T> {
  private free: T[] = [];
  private create: () => T;
  private reset: (item: T) => void;

  constructor(create: () => T, reset: (item: T) => void, prewarm = 0) {
    this.create = create;
    this.reset = reset;
    for (let i = 0; i < prewarm; i++) this.free.push(create());
  }

  acquire(): T {
    const item = this.free.pop();
    if (item) {
      this.reset(item);
      return item;
    }
    return this.create();
  }

  release(item: T) {
    this.free.push(item);
  }

  get size() {
    return this.free.length;
  }
}

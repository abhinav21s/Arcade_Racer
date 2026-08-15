// ============================================================
// NEON ARCADE RACER — Generic Object Pool
// ============================================================

export class ObjectPool<T extends { active: boolean }> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;

  constructor(
    createFn: () => T,
    resetFn: (obj: T) => void,
    initialSize = 10
  ) {
    this.createFn = createFn;
    this.resetFn  = resetFn;
    for (let i = 0; i < initialSize; i++) {
      const obj = this.createFn();
      obj.active = false;
      this.pool.push(obj);
    }
  }

  /** Get an inactive object from the pool, or create a new one */
  acquire(): T {
    let obj = this.pool.find(o => !o.active);
    if (!obj) {
      obj = this.createFn();
      this.pool.push(obj);
    }
    this.resetFn(obj);
    obj.active = true;
    return obj;
  }

  /** Return an object to the pool */
  release(obj: T): void {
    obj.active = false;
  }

  /** Get all active objects */
  getActive(): T[] {
    return this.pool.filter(o => o.active);
  }

  /** Release all objects */
  releaseAll(): void {
    this.pool.forEach(o => { o.active = false; });
  }

  /** Total pool size */
  get size(): number {
    return this.pool.length;
  }

  /** Number of active objects */
  get activeCount(): number {
    return this.pool.filter(o => o.active).length;
  }
}

/**
 * A small least-recently-used cache. Used to keep the results of pure, costly functions (HTML
 * sanitizing, decrypted media) across renders and room switches without growing forever.
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  private readonly max: number;

  private readonly onEvict?: (value: V, key: K) => void;

  constructor(max: number, onEvict?: (value: V, key: K) => void) {
    this.max = max;
    this.onEvict = onEvict;
  }

  get size(): number {
    return this.map.size;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    // Map keeps insertion order: moving the key to the end marks it as recently used.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      const old = this.map.get(key) as V;
      this.map.delete(key);
      if (old !== value) this.onEvict?.(old, key);
    }
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as K;
      const evicted = this.map.get(oldest) as V;
      this.map.delete(oldest);
      this.onEvict?.(evicted, oldest);
    }
  }

  delete(key: K): void {
    if (!this.map.has(key)) return;
    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.onEvict?.(value, key);
  }

  clear(): void {
    if (this.onEvict) this.map.forEach((value, key) => this.onEvict?.(value, key));
    this.map.clear();
  }
}

/** Wraps a pure string function with an LRU cache of its results. */
export const memoizeString = (fn: (input: string) => string, max: number): ((input: string) => string) => {
  const cache = new LruCache<string, string>(max);
  return (input: string) => {
    const hit = cache.get(input);
    if (hit !== undefined) return hit;
    const result = fn(input);
    cache.set(input, result);
    return result;
  };
};

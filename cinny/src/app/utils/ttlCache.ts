/**
 * A small map whose entries expire after `ttlMs`. No imports, so the unit tests can load it.
 */
export const createTtlCache = <T>(ttlMs: number, now: () => number = () => Date.now()) => {
  const entries = new Map<string, { value: T; at: number }>();
  return {
    get(key: string): T | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (now() - entry.at >= ttlMs) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: T): void {
      entries.set(key, { value, at: now() });
    },
    delete(key: string): void {
      entries.delete(key);
    },
    /** Drops every entry whose key starts with `prefix`. */
    deletePrefix(prefix: string): void {
      Array.from(entries.keys())
        .filter((key) => key.startsWith(prefix))
        .forEach((key) => entries.delete(key));
    },
    size: () => entries.size,
  };
};

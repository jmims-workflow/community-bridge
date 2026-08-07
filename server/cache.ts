// In-memory cache, good enough for a single server instance / small deployment.
// If this app ever runs on multiple instances or needs to survive restarts,
// swap this for Redis or a small database table keyed the same way.

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 3; // 3 days: fresh enough, but avoids re-querying on every click

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// Lets a "Report an issue" submission force the next search to bypass the
// cache and re-query fresh, rather than serving the same bad entry again.
export function cacheInvalidate(key: string): void {
  store.delete(key);
}

export function cacheKeyFor(county: string, state: string, category: string): string {
  return `${state.trim().toLowerCase()}|${county.trim().toLowerCase()}|${category}`;
}

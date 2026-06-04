interface CacheEntry {
  htmlContent: string;
  markdownContent: string;
  timestamp: number;
  hitCount: number;
}

// Configurable via env vars, defaults to 24h TTL, max 500 entries
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;     // 24 hours
const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

class SimpleCache {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    ttlMs: number = DEFAULT_TTL_MS,
    maxEntries: number = DEFAULT_MAX_ENTRIES,
    cleanupIntervalMs: number = DEFAULT_CLEANUP_INTERVAL_MS
  ) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.startCleanup(cleanupIntervalMs);
  }

  private startCleanup(cleanupIntervalMs: number): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, cleanupIntervalMs);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Evict entries when cache exceeds maxEntries.
   * Uses LFU + age hybrid: evict lowest hitCount first, break ties by oldest.
   */
  private evictIfNeeded(): void {
    if (this.cache.size < this.maxEntries) return;

    // Find the entry with lowest hitCount, breaking ties by oldest timestamp
    let worstKey: string | null = null;
    let worstScore = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // Lower score = more evictable. Weight: hitCount dominates, age breaks ties.
      const ageScore = (Date.now() - entry.timestamp) / this.ttlMs;
      const score = entry.hitCount + ageScore;
      if (score < worstScore) {
        worstScore = score;
        worstKey = key;
      }
    }

    if (worstKey) {
      this.cache.delete(worstKey);
    }
  }

  get(url: string): CacheEntry | null {
    const entry = this.cache.get(url);
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(url);
      return null;
    }

    // Increment hit count for LFU eviction
    entry.hitCount++;

    return { ...entry }; // Return shallow copy to prevent mutation
  }

  set(url: string, htmlContent: string, markdownContent: string): void {
    this.evictIfNeeded();
    this.cache.set(url, {
      htmlContent,
      markdownContent,
      timestamp: Date.now(),
      hitCount: 0
    });
  }

  clear(): void {
    this.cache.clear();
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }

  // Get cache statistics for debugging
  getStats(): { size: number; maxEntries: number; ttlMs: number; entries: Array<{ url: string; age: number; hitCount: number }> } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([url, entry]) => ({
      url,
      age: now - entry.timestamp,
      hitCount: entry.hitCount
    }));

    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      ttlMs: this.ttlMs,
      entries
    };
  }
}

// Global cache instance — configured from env vars
const cacheTtlMs = parseInt(process.env.CACHE_TTL_MS || '', 10) || DEFAULT_TTL_MS;
const cacheMaxEntries = parseInt(process.env.CACHE_MAX_ENTRIES || '', 10) || DEFAULT_MAX_ENTRIES;

export const urlCache = new SimpleCache(cacheTtlMs, cacheMaxEntries);

// Export for testing and cleanup
export { SimpleCache };

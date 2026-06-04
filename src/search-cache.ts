import { createHash } from "node:crypto";

/**
 * Search result cache with TTL.
 * Keys are SHA-256 hashes of (tool_name + canonical_args_json).
 * This is separate from the URL content cache (cache.ts) — that one caches
 * raw HTML→Markdown conversions, this one caches search result aggregation.
 */

interface SearchCacheEntry {
  result: string;
  timestamp: number;
  toolName: string;
  hitCount: number;
}

// Default TTL: 24 hours for search, 1 hour for suggestions
export const DEFAULT_SEARCH_TTL = 24 * 60 * 60 * 1000; // 24h in ms
export const SUGGESTIONS_TTL = 60 * 60 * 1000; // 1h in ms
const MAX_ENTRIES = 500;

class SearchCache {
  private cache = new Map<string, SearchCacheEntry>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    maxEntries: number = MAX_ENTRIES,
    defaultTtlMs: number = DEFAULT_SEARCH_TTL,
    cleanupIntervalMs: number = 60 * 60 * 1000 // sweep every hour
  ) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
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
      if (now - entry.timestamp > this.defaultTtlMs) {
        this.cache.delete(key);
      }
    }
  }

  private makeKey(toolName: string, args: Record<string, any>): string {
    // Canonical: remove undefined/null values, sort keys
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(args)) {
      if (v !== undefined && v !== null) {
        clean[k] = v;
      }
    }
    const canonical = JSON.stringify(clean, Object.keys(clean).sort());
    return createHash("sha256").update(`${toolName}:${canonical}`).digest("hex");
  }

  private evictLfu(): void {
    if (this.cache.size <= this.maxEntries) return;
    // Sort by (hitCount ASC, timestamp ASC) — evict least useful first
    const sorted = [...this.cache.entries()].sort(
      (a, b) => a[1].hitCount - b[1].hitCount || a[1].timestamp - b[1].timestamp
    );
    const toRemove = this.cache.size - this.maxEntries;
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(sorted[i][0]);
    }
  }

  get(toolName: string, args: Record<string, any>): SearchCacheEntry | null {
    const key = this.makeKey(toolName, args);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.defaultTtlMs) {
      this.cache.delete(key);
      return null;
    }
    entry.hitCount++;
    return entry;
  }

  put(
    toolName: string,
    args: Record<string, any>,
    result: string,
    ttlMs?: number
  ): void {
    const key = this.makeKey(toolName, args);
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      toolName,
      hitCount: 0,
    });
    this.evictLfu();
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

  get stats(): { size: number; maxEntries: number } {
    return { size: this.cache.size, maxEntries: this.maxEntries };
  }
}

// Global search cache instance
export const searchCache = new SearchCache();

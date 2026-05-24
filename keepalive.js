/**
 * Zero Gravity — Supabase Keep-Alive + Request Optimisation Layer
 *
 * Three responsibilities:
 *  1. KEEP-ALIVE  — ping Supabase every 9 min while a user has the tab open so
 *                   the free-tier project never pauses due to inactivity.
 *  2. DEDUP       — if the same query is fired multiple times simultaneously
 *                   (e.g. 500 users loading the same page) only ONE network
 *                   request leaves the browser; the rest share the promise.
 *  3. CACHE       — successful responses are stored with a TTL; subsequent
 *                   callers get the cached value with zero extra network hops.
 */
(function () {
  "use strict";

  /* ── Configuration ──────────────────────────────────────────────── */
  const PING_INTERVAL_MS   = 9 * 60 * 1000;   // 9 minutes
  const DEFAULT_TTL_MS     = 5 * 60 * 1000;   // 5-minute response cache
  const MAX_CACHE_ENTRIES  = 64;
  const STORAGE_KEY_PREFIX = "zg-kc::";

  /* ── In-memory stores ───────────────────────────────────────────── */
  /** @type {Map<string, {promise: Promise<any>}>} */
  const pendingRequests = new Map();

  /** @type {Map<string, {value: any, expiresAt: number}>} */
  const memCache = new Map();

  /* ── Cache helpers ──────────────────────────────────────────────── */
  function cacheGet(key) {
    const entry = memCache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { memCache.delete(key); return undefined; }
    return entry.value;
  }

  function cacheSet(key, value, ttlMs = DEFAULT_TTL_MS) {
    // Evict oldest entry when at capacity
    if (memCache.size >= MAX_CACHE_ENTRIES) {
      const oldest = memCache.keys().next().value;
      memCache.delete(oldest);
    }
    memCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  function cacheInvalidate(pattern) {
    for (const key of memCache.keys()) {
      if (key.includes(pattern)) memCache.delete(key);
    }
  }

  /* ── Request deduplication ──────────────────────────────────────── */
  /**
   * Execute `fn` but deduplicate concurrent identical calls by `key`.
   * If a call with `key` is already in-flight, returns the same promise.
   * Caches the result for `ttlMs` milliseconds.
   *
   * @param {string}   key    - unique identifier for this request
   * @param {Function} fn     - async function that performs the actual request
   * @param {number}   ttlMs  - cache lifetime in milliseconds
   * @returns {Promise<any>}
   */
  async function deduped(key, fn, ttlMs = DEFAULT_TTL_MS) {
    // 1. Return cached value if fresh
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;

    // 2. Return in-flight promise if one exists
    if (pendingRequests.has(key)) {
      return pendingRequests.get(key).promise;
    }

    // 3. Start new request, register it so other callers share it
    const promise = (async () => {
      try {
        const result = await fn();
        cacheSet(key, result, ttlMs);
        return result;
      } finally {
        pendingRequests.delete(key);
      }
    })();

    pendingRequests.set(key, { promise });
    return promise;
  }

  /* ── Keep-alive ping ────────────────────────────────────────────── */
  function getConfig() {
    return window.ZERO_GRAVITY_SUPABASE_CONFIG || {};
  }

  async function ping() {
    const cfg = getConfig();
    if (!cfg.url || !cfg.anonKey) return;

    try {
      // Lightest possible query: ask for row count (head=true) on a tiny table.
      // This touches the DB layer and prevents the project from pausing.
      const url = `${cfg.url}/rest/v1/${cfg.profilesTable || "zg_profiles"}?select=id&limit=1`;
      await fetch(url, {
        method : "HEAD",
        headers: {
          apikey       : cfg.anonKey,
          Authorization: `Bearer ${cfg.anonKey}`,
          "Range"      : "0-0",
        },
        // Don't follow redirects, don't cache this request
        cache: "no-store",
      });
    } catch (_err) {
      // Network errors are silent — the next ping will retry
    }
  }

  function startHeartbeat() {
    // First ping is slightly delayed so it doesn't race with page load
    setTimeout(() => {
      ping();
      setInterval(ping, PING_INTERVAL_MS);
    }, 15_000);
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  /**
   * ZGCache — shared request cache / dedup layer for all page scripts.
   *
   * Usage example:
   *   const rows = await ZGCache.fetch("members-list", async () => {
   *     const { data } = await client.from("zg_team_directory").select("*");
   *     return data;
   *   }, 5 * 60 * 1000);
   */
  window.ZGCache = Object.freeze({
    /**
     * Fetch data with automatic deduplication and caching.
     * @param {string}   key   - cache key (should be unique per query)
     * @param {Function} fn    - async function returning the data
     * @param {number}   [ttl] - cache TTL in ms (default 5 min)
     */
    fetch: deduped,

    /** Manually invalidate cache entries whose key contains `pattern`. */
    invalidate: cacheInvalidate,

    /** Force an immediate Supabase keep-alive ping. */
    ping,
  });

  /* ── Initialise ─────────────────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", startHeartbeat);
})();

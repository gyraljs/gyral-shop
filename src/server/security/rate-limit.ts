// In-memory sliding-window rate limiting (docs/design-docs/0002-security.md). Fine for one
// local process; a shared store would replace this behind the same interface.

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  /** Milliseconds until the next attempt would be allowed (0 when allowed). */
  readonly retryAfterMs: number;
}

export interface RateLimiterOptions {
  readonly limit: number;
  readonly windowMs: number;
  readonly now?: () => number;
  /** Upper bound on tracked keys; the least recently used keys are dropped first. */
  readonly maxKeys?: number;
}

export class SlidingWindowLimiter {
  readonly limit: number;
  readonly windowMs: number;
  readonly #now: () => number;
  readonly #maxKeys: number;
  /** Timestamps of attempts inside the window, oldest first, per key (Map order = recency). */
  readonly #hits = new Map<string, number[]>();

  constructor(options: RateLimiterOptions) {
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.#now = options.now ?? Date.now;
    this.#maxKeys = options.maxKeys ?? 10_000;
  }

  /** Records an attempt for `key` if allowed. A blocked attempt does not extend the block. */
  hit(key: string): RateLimitResult {
    const now = this.#now();
    const recent = this.#recent(key, now);
    if (recent.length >= this.limit) {
      const oldest = recent[0] ?? now;
      return { allowed: false, remaining: 0, retryAfterMs: oldest + this.windowMs - now };
    }
    recent.push(now);
    this.#store(key, recent);
    return { allowed: true, remaining: this.limit - recent.length, retryAfterMs: 0 };
  }

  /** Records attempts for several keys (per IP and per account); blocked if any is blocked. */
  hitAll(keys: readonly string[]): RateLimitResult {
    const results = keys.map((k) => this.hit(k));
    const blocked = results.filter((r) => !r.allowed);
    if (blocked.length > 0) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(...blocked.map((r) => r.retryAfterMs)),
      };
    }
    return {
      allowed: true,
      remaining: Math.min(...results.map((r) => r.remaining)),
      retryAfterMs: 0,
    };
  }

  /** Forget a key, e.g. the account key after a successful login. */
  reset(key: string): void {
    this.#hits.delete(key);
  }

  get size(): number {
    return this.#hits.size;
  }

  #recent(key: string, now: number): number[] {
    const kept = (this.#hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (kept.length === 0) this.#hits.delete(key);
    return kept;
  }

  #store(key: string, hits: number[]): void {
    this.#hits.delete(key); // re-insert to mark as most recently used
    this.#hits.set(key, hits);
    while (this.#hits.size > this.#maxKeys) {
      const oldest = this.#hits.keys().next().value;
      if (oldest === undefined) break;
      this.#hits.delete(oldest);
    }
  }
}

/** The limits ADR 0002 asks for; routes import these so limits live in one place. */
export const LIMITS = {
  /** Login: 10 attempts per IP and 5 per account per 15 minutes. */
  loginPerIp: { limit: 10, windowMs: 15 * 60_000 },
  loginPerAccount: { limit: 5, windowMs: 15 * 60_000 },
  /** Registration: 5 per IP per hour. */
  registerPerIp: { limit: 5, windowMs: 60 * 60_000 },
  /** Password reset requests: 5 per IP and 3 per account per hour. */
  resetPerIp: { limit: 5, windowMs: 60 * 60_000 },
  resetPerAccount: { limit: 3, windowMs: 60 * 60_000 },
} as const satisfies Record<string, { limit: number; windowMs: number }>;

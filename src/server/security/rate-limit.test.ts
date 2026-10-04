import { describe, expect, it } from 'vitest';
import { SlidingWindowLimiter } from './rate-limit.js';

const clock = () => {
  let t = 1_000_000;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};

describe('SlidingWindowLimiter', () => {
  it('allows `limit` attempts per window, then reports when the next is allowed', () => {
    const c = clock();
    const l = new SlidingWindowLimiter({ limit: 3, windowMs: 60_000, now: c.now });
    expect([l.hit('k'), l.hit('k'), l.hit('k')].map((r) => r.allowed)).toEqual([true, true, true]);
    c.advance(10_000);
    const blocked = l.hit('k');
    expect(blocked).toEqual({ allowed: false, remaining: 0, retryAfterMs: 50_000 });
  });

  it('slides: old attempts leave the window one by one', () => {
    const c = clock();
    const l = new SlidingWindowLimiter({ limit: 2, windowMs: 1000, now: c.now });
    l.hit('k');
    c.advance(600);
    l.hit('k');
    c.advance(500); // the first attempt is now outside the window
    expect(l.hit('k').allowed).toBe(true);
    expect(l.hit('k').allowed).toBe(false);
  });

  it('blocked attempts do not extend the block', () => {
    const c = clock();
    const l = new SlidingWindowLimiter({ limit: 1, windowMs: 1000, now: c.now });
    l.hit('k');
    for (let i = 0; i < 5; i += 1) {
      c.advance(100);
      l.hit('k');
    }
    c.advance(500); // 1000 ms after the only allowed attempt
    expect(l.hit('k').allowed).toBe(true);
  });

  it('keys are independent; hitAll blocks when any key is over', () => {
    const c = clock();
    const l = new SlidingWindowLimiter({ limit: 1, windowMs: 1000, now: c.now });
    expect(l.hitAll(['ip:1', 'acct:a']).allowed).toBe(true);
    expect(l.hitAll(['ip:2', 'acct:b']).allowed).toBe(true);
    expect(l.hitAll(['ip:3', 'acct:a']).allowed).toBe(false);
    l.reset('acct:a');
    expect(l.hit('acct:a').allowed).toBe(true);
  });

  it('bounds memory by dropping the least recently used keys', () => {
    const l = new SlidingWindowLimiter({ limit: 1, windowMs: 1000, maxKeys: 3 });
    for (const k of ['a', 'b', 'c', 'd']) l.hit(k);
    expect(l.size).toBe(3);
    expect(l.hit('a').allowed).toBe(true); // 'a' was evicted, so it starts fresh
  });
});

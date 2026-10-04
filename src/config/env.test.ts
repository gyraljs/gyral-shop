import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

describe('config', () => {
  it('defaults payment latency to 0 and parses a value', () => {
    expect(loadConfig({}).PAYMENT_LATENCY_MS).toBe(0);
    expect(loadConfig({ PAYMENT_LATENCY_MS: '600' }).PAYMENT_LATENCY_MS).toBe(600);
  });

  it('rejects a negative or non-numeric latency', () => {
    expect(() => loadConfig({ PAYMENT_LATENCY_MS: '-1' })).toThrow(/PAYMENT_LATENCY_MS/);
    expect(() => loadConfig({ PAYMENT_LATENCY_MS: 'fast' })).toThrow(/PAYMENT_LATENCY_MS/);
  });
});

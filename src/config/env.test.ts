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

  it('requires a 32+ character APP_SECRET in production only', () => {
    expect(loadConfig({}).APP_SECRET).toBeUndefined();
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/APP_SECRET/);
    expect(() => loadConfig({ APP_SECRET: 'short' })).toThrow(/APP_SECRET/);
    const secret = 'x'.repeat(32);
    expect(loadConfig({ NODE_ENV: 'production', APP_SECRET: secret }).APP_SECRET).toBe(secret);
  });

  it('validates STORE_TIME_ZONE as an IANA zone, defaulting to New York', () => {
    expect(loadConfig({}).STORE_TIME_ZONE).toBe('America/New_York');
    expect(loadConfig({ STORE_TIME_ZONE: 'Europe/Berlin' }).STORE_TIME_ZONE).toBe('Europe/Berlin');
    expect(() => loadConfig({ STORE_TIME_ZONE: 'Eastern' })).toThrow(/STORE_TIME_ZONE/);
  });
});

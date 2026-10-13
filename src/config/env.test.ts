import { describe, expect, it } from 'vitest';
import { DEFAULT_ADMIN_PASSWORD, loadConfig, seedAdminPassword } from './env.js';

const PROD = {
  NODE_ENV: 'production',
  APP_SECRET: 'x'.repeat(32),
  SITE_ORIGIN: 'https://shop.example',
} as const;

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
    expect(
      loadConfig({
        NODE_ENV: 'production',
        APP_SECRET: secret,
        SITE_ORIGIN: 'https://shop.example',
      }).APP_SECRET,
    ).toBe(secret);
  });

  it('normalizes SITE_ORIGIN, rejects paths, and requires it in production', () => {
    expect(loadConfig({}).SITE_ORIGIN).toBeUndefined();
    expect(loadConfig({ SITE_ORIGIN: 'https://Shop.Example/' }).SITE_ORIGIN).toBe(
      'https://shop.example',
    );
    expect(() => loadConfig({ SITE_ORIGIN: 'https://shop.example/store' })).toThrow(/SITE_ORIGIN/);
    expect(() => loadConfig({ SITE_ORIGIN: 'ftp://shop.example' })).toThrow(/SITE_ORIGIN/);
    expect(() => loadConfig({ SITE_ORIGIN: 'not a url' })).toThrow(/SITE_ORIGIN/);
    const secret = 'x'.repeat(32);
    expect(() => loadConfig({ NODE_ENV: 'production', APP_SECRET: secret })).toThrow(/SITE_ORIGIN/);
    expect(
      loadConfig({
        NODE_ENV: 'production',
        APP_SECRET: secret,
        SITE_ORIGIN: 'https://shop.example',
      }).SITE_ORIGIN,
    ).toBe('https://shop.example');
  });

  it('validates STORE_TIME_ZONE as an IANA zone, defaulting to New York', () => {
    expect(loadConfig({}).STORE_TIME_ZONE).toBe('America/New_York');
    expect(loadConfig({ STORE_TIME_ZONE: 'Europe/Berlin' }).STORE_TIME_ZONE).toBe('Europe/Berlin');
    expect(() => loadConfig({ STORE_TIME_ZONE: 'Eastern' })).toThrow(/STORE_TIME_ZONE/);
  });

  it('trusts proxy headers only when TRUST_PROXY is switched on', () => {
    expect(loadConfig({}).TRUST_PROXY).toBe(false);
    for (const on of ['1', 'true', 'TRUE', 'yes', 'on']) {
      expect(loadConfig({ TRUST_PROXY: on }).TRUST_PROXY).toBe(true);
    }
    for (const off of ['0', 'false', 'no', 'off']) {
      expect(loadConfig({ TRUST_PROXY: off }).TRUST_PROXY).toBe(false);
    }
    expect(() => loadConfig({ TRUST_PROXY: 'maybe' })).toThrow(/TRUST_PROXY/);
  });

  it('parses DEMO_RESET_AT as minutes after local midnight, unset by default', () => {
    expect(loadConfig({}).DEMO_RESET_AT).toBeUndefined();
    expect(loadConfig({ DEMO_RESET_AT: '03:00' }).DEMO_RESET_AT).toBe(180);
    expect(loadConfig({ DEMO_RESET_AT: '23:59' }).DEMO_RESET_AT).toBe(1439);
    expect(loadConfig({ DEMO_RESET_AT: '00:00' }).DEMO_RESET_AT).toBe(0);
    for (const bad of ['3:00', '24:00', '12:60', '0300', 'nightly']) {
      expect(() => loadConfig({ DEMO_RESET_AT: bad })).toThrow(/DEMO_RESET_AT/);
    }
  });

  it('refuses the public admin password for seeding in production', () => {
    expect(seedAdminPassword({ NODE_ENV: 'development' })).toBe(DEFAULT_ADMIN_PASSWORD);
    expect(() => seedAdminPassword({ NODE_ENV: 'production' })).toThrow(/SEED_ADMIN_PASSWORD/);
    expect(() =>
      seedAdminPassword({ NODE_ENV: 'production', SEED_ADMIN_PASSWORD: DEFAULT_ADMIN_PASSWORD }),
    ).toThrow(/SEED_ADMIN_PASSWORD/);
    const own = 'a-long-private-password';
    expect(seedAdminPassword({ NODE_ENV: 'production', SEED_ADMIN_PASSWORD: own })).toBe(own);
    expect(() => loadConfig({ SEED_ADMIN_PASSWORD: 'short' })).toThrow(/SEED_ADMIN_PASSWORD/);
  });

  it('demo mode in production requires a private SEED_ADMIN_PASSWORD at startup', () => {
    expect(() => loadConfig({ ...PROD, DEMO_RESET_AT: '03:00' })).toThrow(/SEED_ADMIN_PASSWORD/);
    expect(() =>
      loadConfig({ ...PROD, DEMO_RESET_AT: '03:00', SEED_ADMIN_PASSWORD: DEFAULT_ADMIN_PASSWORD }),
    ).toThrow(/SEED_ADMIN_PASSWORD/);
    const config = loadConfig({
      ...PROD,
      DEMO_RESET_AT: '03:00',
      SEED_ADMIN_PASSWORD: 'a-long-private-password',
    });
    expect(config.DEMO_RESET_AT).toBe(180);
    // Without demo mode, production never seeds, so the password isn't needed.
    expect(loadConfig(PROD).SEED_ADMIN_PASSWORD).toBeUndefined();
  });
});

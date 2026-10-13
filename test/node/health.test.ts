// GET /healthz (docs/references/deploying.md): what the container health check asks.
import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../../src/db/client.js';
import { healthRoutes } from '../../src/server/routes/health.js';
import { testApp } from '../support/app.js';
import { guest } from '../support/auth.js';

describe('health check', () => {
  it('answers ok with nothing else, uncached, with the security headers', async () => {
    const t = await testApp();
    const res = await t.get('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it('never starts, renews or reads a session, and is not rate limited', async () => {
    const t = await testApp();
    const g = await guest(t);
    for (let n = 0; n < 50; n += 1) {
      const res = await g.get('/healthz');
      expect(res.status).toBe(200);
      expect(res.headers.getSetCookie()).toEqual([]);
    }
  });

  it('answers 503 without details when the database is gone', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gone = {
      select: () => {
        throw new Error('SQLITE_CANTOPEN');
      },
    } as unknown as Db;
    const res = await healthRoutes(gone).request('/healthz');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'unavailable' });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

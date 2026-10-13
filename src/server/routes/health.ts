// GET /healthz: liveness and readiness for the container health check and uptime monitors
// (docs/references/deploying.md). Answers 200 `{"status":"ok"}` when the database answers a
// read, 503 `{"status":"unavailable"}` otherwise, and says nothing else (no versions, counts or
// errors). It starts no session, is never cached and is not rate limited; the proxy's own
// limits cover it from outside (deploy/compose.yaml).
import { Hono } from 'hono';
import type { Db } from '../../db/client.js';
import { probeDatabase } from '../../db/repos/health.js';
import type { AppEnv } from '../security/index.js';

export const HEALTH_PATH = '/healthz';

export function healthRoutes(db: Db): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.get(HEALTH_PATH, async (c) => {
    const headers = { 'cache-control': 'no-store' };
    try {
      await probeDatabase(db);
      return c.json({ status: 'ok' }, 200, headers);
    } catch (error) {
      console.error('health check: the database did not answer', error);
      return c.json({ status: 'unavailable' }, 503, headers);
    }
  });
  return app;
}

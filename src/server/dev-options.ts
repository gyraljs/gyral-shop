// The dev server re-creates the Hono app on every request so server-rendered output follows
// source edits (dev.ts). Anything that must survive across requests is built ONCE here.
import { randomBytes } from 'node:crypto';
import type { Config } from '../config/env.js';
import type { Db } from '../db/client.js';
import type { AppOptions } from './app.js';

/**
 * Options for every per-request `createApp()` in development. The secret signs place-order
 * keys and the guest `orders` cookie, so it must be the same for the whole process: a fresh
 * random secret per request made every order fail with "Your checkout changed".
 */
export function devAppOptions(config: Config, db: Db): AppOptions {
  const secret = config.APP_SECRET ?? randomBytes(32).toString('hex');
  return {
    clientEntry: '/src/client/entry.ts',
    db,
    mode: config.NODE_ENV,
    ...(config.SITE_ORIGIN === undefined ? {} : { siteOrigin: config.SITE_ORIGIN }),
    security: { dev: config.NODE_ENV === 'development' },
    services: {
      paymentLatencyMs: config.PAYMENT_LATENCY_MS,
      timeZone: config.STORE_TIME_ZONE,
      secret,
    },
  };
}

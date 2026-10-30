// The dev server re-creates the Hono app after every server-module edit (Gyral 0.3.8; before
// that, on every request) so server-rendered output follows source edits (dev.ts). Anything that
// must survive across those rebuilds is built ONCE here.
import { randomBytes } from 'node:crypto';
import type { Config } from '../config/env.js';
import type { Db } from '../db/client.js';
import type { AppOptions } from './app.js';

/**
 * Options for every `createApp()` the dev server builds. The secret signs place-order keys and
 * the guest `orders` cookie, so it must be the same for the whole process: a fresh random
 * secret per app makes orders fail with "Your checkout changed" whenever the app is rebuilt
 * (before Gyral 0.3.8 on every request, since then after every edit).
 */
export function devAppOptions(config: Config, db: Db): AppOptions {
  const secret = config.APP_SECRET ?? randomBytes(32).toString('hex');
  return {
    clientEntry: '/src/client/entry.ts',
    db,
    mode: config.NODE_ENV,
    ...(config.SITE_ORIGIN === undefined ? {} : { siteOrigin: config.SITE_ORIGIN }),
    security: { dev: config.NODE_ENV === 'development', trustProxy: config.TRUST_PROXY },
    services: {
      paymentLatencyMs: config.PAYMENT_LATENCY_MS,
      timeZone: config.STORE_TIME_ZONE,
      secret,
    },
  };
}

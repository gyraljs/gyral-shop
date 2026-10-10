// Dev server (Gyral's gyralDevServer): Vite serves browser modules (with HMR); every other
// request is server-rendered by the Hono app, re-loaded per request so SSR follows source edits,
// and streamed. A render error answers with Vite's error overlay.
import { gyralDevServer } from '@gyral/ssr/node';
import { loadConfig } from '../config/env.js';
import { openDb } from '../db/client.js';
import { startPurgeSchedule } from '../services/maintenance.js';
import { devAppOptions } from './dev-options.js';

// One connection for the dev server's lifetime; run `pnpm db:reset` first.
const config = loadConfig();
const db = await openDb(config.DATABASE_URL);
startPurgeSchedule(db); // expired sessions and orphaned guest carts, hourly

// Built once: per-request apps must share the secret (see dev-options.ts). The adapter passes
// the client address that rate limiting reads (security/request.ts) through to the app.
const options = devAppOptions(config, db);

const server = await gyralDevServer({
  entry: '/src/server/app.ts',
  app: (mod: typeof import('./app.js')) => mod.createApp(options),
  port: Number(process.env['PORT'] ?? 5200),
  hmrPort: Number(process.env['HMR_PORT'] ?? 24690),
});
console.log(`gyral-shop: ${server.url}`);

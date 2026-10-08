// `pnpm start` after `pnpm build`: the production server (Gyral ADR 0016). Requires
// NODE_ENV=production, APP_SECRET and SITE_ORIGIN (src/config/env.ts refuses to start without).
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { toNodeListener } from '@gyral/ssr/node';
import { loadConfig } from '../config/env.js';
import { openDb } from '../db/client.js';
import { startPurgeSchedule } from '../services/maintenance.js';
import { createProdApp } from './prod-app.js';

const config = loadConfig();
if (config.NODE_ENV !== 'production') {
  throw new Error('pnpm start serves the production build: set NODE_ENV=production');
}
const db = await openDb(config.DATABASE_URL);
startPurgeSchedule(db); // expired sessions and orphaned guest carts, hourly
const app = await createProdApp({
  distDir: fileURLToPath(new URL('../../dist', import.meta.url)),
  db,
  config,
});
const port = Number(process.env['PORT'] ?? 5200);

// Request URLs are built on SITE_ORIGIN, not on the client's Host header (ADR 0001).
const origin = config.SITE_ORIGIN === undefined ? {} : { origin: config.SITE_ORIGIN };
createServer(toNodeListener(app.fetch, origin)).listen(port, () => {
  console.log(`gyral-shop (production): http://localhost:${String(port)}`);
});

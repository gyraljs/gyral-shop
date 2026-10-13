// `pnpm start` after `pnpm build`: the production server (Gyral ADR 0016). Requires
// NODE_ENV=production, APP_SECRET and SITE_ORIGIN (src/config/env.ts refuses to start without).
// With DEMO_RESET_AT it runs as the public demo (docs/design-docs/0007-deployment.md): it
// migrates and seeds an empty database before listening and resets it to the seed every night.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { toNodeListener } from '@gyral/ssr/node';
import { loadConfig, seedAdminPassword } from '../config/env.js';
import { openDb } from '../db/client.js';
import { catalogChanges } from '../services/container.js';
import { demoSeed, prepareDemo, resetDemo } from '../services/demo.js';
import { startDemoResetSchedule } from '../services/demo-schedule.js';
import { startPurgeSchedule } from '../services/maintenance.js';
import { createProdApp } from './prod-app.js';

const config = loadConfig();
if (config.NODE_ENV !== 'production') {
  throw new Error('pnpm start serves the production build: set NODE_ENV=production');
}
const db = await openDb(config.DATABASE_URL);
// Shared with the app, so the header's cached departments reload after a reset.
const catalog = catalogChanges();
const resetAt = config.DEMO_RESET_AT;
if (resetAt !== undefined) {
  const outcome = await prepareDemo(db, config);
  console.log(`demo: ${outcome === 'seeded' ? 'seeded an empty database' : 'database kept'}`);
  const adminPassword = seedAdminPassword(config);
  startDemoResetSchedule({
    at: resetAt,
    timeZone: config.STORE_TIME_ZONE,
    reset: async () => {
      await resetDemo(db, await demoSeed(adminPassword));
      catalog.changed();
    },
  });
}
startPurgeSchedule(db); // expired sessions and orphaned guest carts, hourly
const app = await createProdApp({
  distDir: fileURLToPath(new URL('../../dist', import.meta.url)),
  db,
  config,
  catalog,
});
const port = Number(process.env['PORT'] ?? 5200);

// Request URLs are built on SITE_ORIGIN, not on the client's Host header (ADR 0001).
const origin = config.SITE_ORIGIN === undefined ? {} : { origin: config.SITE_ORIGIN };
createServer(toNodeListener(app.fetch, origin)).listen(port, () => {
  console.log(
    `gyral-shop (production): http://localhost:${String(port)}` +
      (config.TRUST_PROXY ? ' (trusting X-Forwarded-* from the proxy)' : ''),
  );
});

// Build step after `vite build` (Gyral ADR 0016): renders every `ssg` route to dist/static.
// Needs a migrated, seeded database (the header lists departments): `pnpm db:reset` first.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientEntryFromManifest, prerender } from '@gyral/ssr/static';
import { loadConfig, type Config } from '../config/env.js';
import { openDb, type Db } from '../db/client.js';
import { CLIENT_ENTRY_SOURCE, productionApp } from './prod-app.js';
import { STATIC_PATHS } from './routes/content.js';

/** Used only when SITE_ORIGIN is unset (a local build); production requires SITE_ORIGIN. */
const DEV_ORIGIN = 'http://localhost:5200';

export async function prerenderSite(
  distDir: string,
  db: Db,
  config: Pick<Config, 'PAYMENT_LATENCY_MS' | 'APP_SECRET' | 'SITE_ORIGIN'>,
): Promise<readonly string[]> {
  const clientEntry = await clientEntryFromManifest(
    join(distDir, 'client', '.vite', 'manifest.json'),
    CLIENT_ENTRY_SOURCE,
  );
  const pages = await prerender({
    app: productionApp({ db, config }, clientEntry),
    paths: STATIC_PATHS,
    outDir: join(distDir, 'static'),
    origin: config.SITE_ORIGIN ?? DEV_ORIGIN,
  });
  return pages.map((p) => p.path);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  if (config.SITE_ORIGIN === undefined) {
    console.warn(`SITE_ORIGIN is not set: prerendered pages will use ${DEV_ORIGIN} in their URLs.`);
  }
  const dist = fileURLToPath(new URL('../../dist', import.meta.url));
  const paths = await prerenderSite(dist, await openDb(config.DATABASE_URL), config);
  console.log(`prerendered: ${paths.join(', ')}`);
}

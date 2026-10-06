// Production serving (`pnpm start`, Gyral ADR 0016): content-hashed client assets are served
// immutable, prerendered (`ssg`) pages from disk, everything else by the app per request.
// Files served from disk never pass through the app's middleware, so the same security
// headers are added here (docs/design-docs/0002-security.md).
import { productionServer, type FetchApp } from '@gyral/ssr/static';
import type { Config } from '../config/env.js';
import type { Db } from '../db/client.js';
import { createApp } from './app.js';
import { pagePolicy } from './csp.js';
import { securityHeaderValues } from './security/headers.js';

export const CLIENT_ENTRY_SOURCE = 'src/client/entry.ts';

export interface ProdOptions {
  /** The build output: `client/` (Vite) and `static/` (prerendered pages). */
  readonly distDir: string;
  readonly db: Db;
  readonly config: Pick<Config, 'PAYMENT_LATENCY_MS' | 'APP_SECRET' | 'SITE_ORIGIN'> &
    Partial<Pick<Config, 'STORE_TIME_ZONE'>>;
}

/** The built entry and the modules to preload with it (from the Vite manifest). */
export interface ClientAssets {
  readonly clientEntry: string;
  readonly modulepreload: readonly string[];
}

/** The app as production runs it, shared by `pnpm start` and the prerender step. */
export const productionApp = (options: Omit<ProdOptions, 'distDir'>, assets: ClientAssets) =>
  createApp({
    ...assets,
    db: options.db,
    mode: 'production',
    security: { dev: false },
    ...(options.config.SITE_ORIGIN === undefined ? {} : { siteOrigin: options.config.SITE_ORIGIN }),
    services: {
      paymentLatencyMs: options.config.PAYMENT_LATENCY_MS,
      ...(options.config.STORE_TIME_ZONE === undefined
        ? {}
        : { timeZone: options.config.STORE_TIME_ZONE }),
      ...(options.config.APP_SECRET === undefined ? {} : { secret: options.config.APP_SECRET }),
    },
  });

export async function createProdApp(options: ProdOptions): Promise<FetchApp> {
  const served = await productionServer({
    distDir: options.distDir,
    entry: CLIENT_ENTRY_SOURCE,
    createApp: (assets) => productionApp(options, assets),
  });
  return {
    fetch: async (request) => {
      const response = await served.fetch(request);
      if (response.headers.has('content-security-policy')) return response; // came from the app
      const headers = new Headers(response.headers);
      const https = new URL(request.url).protocol === 'https:';
      const csp = await pagePolicy({ dev: false });
      for (const [name, value] of Object.entries(securityHeaderValues({ https, csp }))) {
        headers.set(name, value);
      }
      return new Response(response.body, { status: response.status, headers });
    },
  };
}

// Production serving (`pnpm start`, Gyral ADR 0016): content-hashed client assets are served
// immutable, prerendered (`ssg`) pages from disk, everything else by the app per request.
// Files served from disk never pass through the app's middleware, so the same security
// headers are added here (docs/design-docs/0002-security.md).
import type { NodeEnv } from '@gyral/ssr/node';
import { productionServer } from '@gyral/ssr/static';
import type { Config } from '../config/env.js';
import type { Db } from '../db/client.js';
import { createApp } from './app.js';
import { staticPolicy } from './csp.js';
import type { ComponentAssets, ComponentModule } from '@gyral/ssr';
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
  /**
   * The components pages load automatically (`productionServer` reads them from the build's
   * component manifest). The prerender step passes none: the static content pages render only
   * the shell components, which the entry imports.
   */
  readonly components?: ComponentAssets;
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

/**
 * `components` without the modules the head already preloads. Gyral's loader (0.3.1, still in
 * 0.3.2) imports the entry, so its preload list repeats the entry's graph, and `renderPage` would
 * link each of those modules a second time after the body (the browser fetches each once either
 * way). The head's list stays first, the entry at its top.
 */
export function withoutHeadPreloads(
  components: ComponentAssets,
  modulepreload: readonly string[],
): ComponentAssets {
  const inHead = new Set(modulepreload);
  const rest = (hrefs: readonly string[]) => hrefs.filter((href) => !inHead.has(href));
  const modules = new Map<string, ComponentModule>();
  for (const [tag, module] of components.modules)
    modules.set(tag, { ...module, preload: rest(module.preload) });
  return {
    ...components,
    modules,
    ...(components.preload === undefined ? {} : { preload: rest(components.preload) }),
  };
}

/** The production handler; `env` is what `toNodeListener` passes (src/server/prod.ts). */
export interface ProdApp {
  readonly fetch: (request: Request, env?: NodeEnv) => Response | Promise<Response>;
}

export async function createProdApp(options: ProdOptions): Promise<ProdApp> {
  // Every component module is imported by now (the app imports them statically).
  const csp = await staticPolicy();
  // productionServer passes the adapter's env (the client address rate limiting reads,
  // security/request.ts) on to the app with the request. Responses the app didn't make (assets,
  // prerendered pages) get the same security headers here.
  return productionServer<NodeEnv>({
    distDir: options.distDir,
    entry: CLIENT_ENTRY_SOURCE,
    createApp: ({ clientEntry, modulepreload, components }) =>
      productionApp(options, {
        clientEntry: clientEntry ?? '',
        modulepreload,
        ...(components === undefined
          ? {}
          : { components: withoutHeadPreloads(components, modulepreload) }),
      }),
    onResponse: (response, request) => {
      if (response.headers.has('content-security-policy')) return response; // came from the app
      const headers = new Headers(response.headers);
      const https = new URL(request.url).protocol === 'https:';
      for (const [name, value] of Object.entries(securityHeaderValues({ https, csp }))) {
        headers.set(name, value);
      }
      return new Response(response.body, { status: response.status, headers });
    },
  });
}

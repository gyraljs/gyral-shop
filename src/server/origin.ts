// The public origin for absolute URLs (canonical, sitemap, structured data, email links).
// SITE_ORIGIN wins: behind a proxy the request URL is internal (docs/design-docs/0001-stack.md).
import type { Context } from 'hono';
import { tryGetContext } from 'hono/context-storage';
import type { AppEnv } from './security/index.js';

/** The configured site origin, or the request's own origin when none is configured. */
export function publicOrigin(c: Context): string {
  return tryGetContext<AppEnv>()?.get('siteOrigin') ?? new URL(c.req.url).origin;
}

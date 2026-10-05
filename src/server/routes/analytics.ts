// POST /api/analytics/page-view: page views of prerendered pages (shop-8c2). Static files
// never pass the analytics middleware, so the page sends a beacon after hydration. Like the
// consent form it is origin-verified, not token-verified (ADR 0002): a beacon must not start a
// session. Consent is checked again here, only prerendered paths count (server-rendered pages
// are already counted by the middleware), and nothing is ever answered but 204.
import { Hono } from 'hono';
import * as v from 'valibot';
import type { Db } from '../../db/client.js';
import { recordEvent } from '../../db/repos/analytics.js';
import { readConsent } from '../consent.js';
import type { AppEnv } from '../security/index.js';
import { STATIC_PATHS } from './content.js';

export const PAGE_VIEW_PATH = '/api/analytics/page-view';

const PageView = v.object({ path: v.pipe(v.string(), v.maxLength(200)) });

export function analyticsRoutes(db: Db): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.post(PAGE_VIEW_PATH, async (c) => {
    if (readConsent(c)?.analytics !== true) return c.body(null, 204);
    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = v.safeParse(PageView, body);
    if (!parsed.success || !STATIC_PATHS.includes(parsed.output.path)) return c.body(null, 204);
    const sessionId = c.get('session')?.id;
    await recordEvent(db, {
      kind: 'page_view',
      path: parsed.output.path,
      ...(sessionId === undefined ? {} : { sessionId }),
      data: { via: 'beacon' },
    }).catch((error: unknown) => {
      console.error('analytics: could not record beacon', error);
    });
    return c.body(null, 204);
  });
  return app;
}

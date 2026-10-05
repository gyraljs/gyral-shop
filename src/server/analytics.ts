// Mock analytics (consent.md): page views and add-to-cart events, recorded on the server so
// they work without JavaScript, and ONLY when the visitor consented to analytics. Mounted as
// one middleware, so feature routes stay unaware of it.
import type { Context, MiddlewareHandler } from 'hono';
import type { Db } from '../db/client.js';
import { recordEvent, type AnalyticsEvent } from '../db/repos/analytics.js';
import { readConsent } from './consent.js';
import type { AppEnv } from './security/index.js';

/** The add-to-cart endpoints (form and JSON) whose successful answers count as events. */
const ADD_TO_CART = new Set(['/cart/add', '/api/cart/items']);

async function addedSku(request: Request): Promise<Readonly<Record<string, unknown>>> {
  const type = request.headers.get('content-type') ?? '';
  try {
    const body = type.includes('application/json')
      ? ((await request.clone().json()) as Record<string, unknown>)
      : Object.fromEntries((await request.clone().formData()).entries());
    const sku = body['sku'];
    const quantity = Number(body['quantity'] ?? 1);
    return {
      sku: typeof sku === 'string' ? sku : '',
      quantity: Number.isFinite(quantity) ? quantity : 1,
    };
  } catch {
    return {};
  }
}

const isPage = (c: Context): boolean =>
  c.req.method === 'GET' &&
  c.res.status === 200 &&
  (c.res.headers.get('content-type') ?? '').startsWith('text/html');

export const analyticsMiddleware =
  (db: Db): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const consent = readConsent(c);
    const adding = c.req.method === 'POST' && ADD_TO_CART.has(c.req.path);
    const data = consent?.analytics === true && adding ? await addedSku(c.req.raw) : undefined;
    await next();
    if (consent?.analytics !== true) return;
    const base = { path: c.req.path, ...withSession(c) };
    let event: AnalyticsEvent | undefined;
    if (isPage(c)) event = { ...base, kind: 'page_view' };
    else if (adding && c.res.status < 400)
      event = { ...base, kind: 'add_to_cart', data: data ?? {} };
    if (event === undefined) return;
    // Analytics must never break a page: failures are logged and dropped.
    await recordEvent(db, event).catch((error: unknown) => {
      console.error('analytics: could not record event', error);
    });
  };

function withSession(c: Context<AppEnv>): { sessionId?: string } {
  const id = c.get('session')?.id;
  return id === undefined ? {} : { sessionId: id };
}

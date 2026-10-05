// Admin orders API (docs/product-specs/admin.md, "Orders"). Admins only. A status change is a
// formAction over the shared TransitionForm: `{ _tag: 'Transitioned', status, notice }`, a 422
// IntentRejected (bad refund amount), or 409 `{ error: 'conflict', message }`.
import { Hono, type Context } from 'hono';
import { formAction, rejectWith } from '@gyral/ssr';
import type { IntentRejected } from '@gyral/core';
import * as v from 'valibot';
import { OrderStatusSchema, parseDollars } from '../../domain/admin.js';
import type { Services } from '../../services/container.js';
import { adminOrder, changeOrder, listOrders } from '../../services/admin-orders.js';
import { TransitionForm } from '../../ui/admin/schemas.js';
import { requireAdmin, type AppEnv } from '../security/index.js';
import { NO_STORE } from './admin-http.js';
import { adminFailure } from './admin-products.js';

type C = Context<AppEnv>;

const day = v.pipe(v.string(), v.isoDate());

const ListQuery = v.object({
  status: v.optional(OrderStatusSchema),
  from: v.optional(day),
  to: v.optional(day),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ''),
  page: v.optional(v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)), '1'),
});

const DAY_MS = 86_400_000;

const asJson = (rejected: IntentRejected) =>
  Response.json(
    { _tag: rejected._tag, intent: rejected.intent, issues: rejected.issues },
    { status: 422, headers: NO_STORE },
  );

export function adminOrderRoutes(services: Services): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('/api/admin/*', requireAdmin());

  routes.get('/api/admin/orders', async (c: C) => {
    const raw = Object.fromEntries(
      Object.entries(c.req.query()).filter(([, value]) => value !== ''),
    );
    const parsed = v.safeParse(ListQuery, raw);
    if (!parsed.success) return c.json({ error: 'invalid-query' }, 400, NO_STORE);
    const q = parsed.output;
    const result = await listOrders(services.db, c.get('user'), {
      status: q.status,
      from: q.from === undefined ? undefined : new Date(`${q.from}T00:00:00Z`),
      // "to" is inclusive in the form: orders placed during that day count.
      to:
        q.to === undefined ? undefined : new Date(new Date(`${q.to}T00:00:00Z`).getTime() + DAY_MS),
      q: q.q,
      page: q.page,
    });
    return result.ok ? c.json(result.value, 200, NO_STORE) : adminFailure(c, result.error);
  });

  routes.get('/api/admin/orders/:number', async (c) => {
    const result = await adminOrder(services.db, c.get('user'), c.req.param('number'));
    return result.ok ? c.json(result.value, 200, NO_STORE) : adminFailure(c, result.error);
  });

  routes.post('/api/admin/orders/:number/transition', (c) =>
    formAction(TransitionForm, {
      intent: 'Transition',
      valid: async (data) => {
        const result = await changeOrder(services, c.get('user'), {
          number: c.req.param('number'),
          action: data.action,
          ...(data.action === 'Refund' ? { amountCents: parseDollars(data.amount) ?? 0 } : {}),
          origin: new URL(c.req.url).origin,
        });
        if (result.ok) return c.json({ _tag: 'Transitioned', ...result.value }, 200, NO_STORE);
        if (result.error._tag === 'Conflict') {
          return c.json({ error: 'conflict', message: result.error.message }, 409, NO_STORE);
        }
        return result.error._tag === 'Invalid'
          ? rejectWith(result.error.issues)
          : adminFailure(c, result.error);
      },
      invalid: asJson,
    })(c.req.raw),
  );

  return routes;
}

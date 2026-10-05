// Order pages (docs/product-specs/orders.md): confirmation, a member's history and order
// detail with cancellation, and guest lookup by number + email. A visitor who may not see an
// order (unknown, foreign, or a guest on a new device) is sent to the lookup form, the same way
// for every number, so order numbers can't be probed.
import { Hono, type Context } from 'hono';
import * as v from 'valibot';
import type { Services } from '../../services/container.js';
import {
  cancelMemberOrder,
  findOrderDetail,
  lookupGuestOrder,
  memberOrderHistory,
  type OrderDetail,
} from '../../services/order-history.js';
import { findOrderView } from '../../services/order-view.js';
import { orderConfirmationPage } from '../../ui/pages/order-confirmation.js';
import { orderDetailPage, type OrderDetailData } from '../../ui/pages/order-detail.js';
import { orderHistoryPage } from '../../ui/pages/order-history.js';
import { orderLookupPage } from '../../ui/pages/order-lookup.js';
import type { RenderPage } from '../document.js';
import { setFlash, takeFlash } from '../flash.js';
import { canSeeOrder, grantOrderAccess } from '../order-access.js';
import {
  csrfTokenFor,
  ip,
  limit,
  requireUser,
  SlidingWindowLimiter,
  type AppEnv,
} from '../security/index.js';

export interface OrderRoutesOptions {
  readonly services: Services;
  readonly render: RenderPage;
}

/** Guest lookups: 10 per IP and 5 per order number per 15 minutes. */
export const LOOKUP_LIMITS = {
  perIp: { limit: 10, windowMs: 15 * 60_000 },
  perOrder: { limit: 5, windowMs: 15 * 60_000 },
} as const;

const Lookup = v.object({
  number: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40)),
  email: v.pipe(v.string(), v.trim(), v.maxLength(254)),
});

const NOT_FOUND = "We couldn't find an order with that number and email. Check both and try again.";

const lookupRedirect = (number: string) => `/order/lookup?number=${encodeURIComponent(number)}`;

const detailData = (
  o: OrderDetail,
  extra: Pick<OrderDetailData, 'back'> & Partial<Pick<OrderDetailData, 'cancel' | 'flash'>>,
): OrderDetailData => ({
  number: o.number,
  status: o.status,
  placedAt: o.placedAt,
  lines: o.lines,
  totals: o.totals,
  refunded: o.refunded,
  promoCode: o.promoCode,
  address: o.address,
  shipping: o.shipping,
  payment: o.payment,
  events: o.events,
  ...extra,
});

export function orderRoutes({ services, render }: OrderRoutesOptions): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const clock = () => services.now().getTime();
  const lookupPerIp = new SlidingWindowLimiter({ ...LOOKUP_LIMITS.perIp, now: clock });
  const lookupPerOrder = new SlidingWindowLimiter({ ...LOOKUP_LIMITS.perOrder, now: clock });

  routes.get('/order/:number/confirmation', async (c) => {
    const order = await findOrderView(services.db, c.req.param('number'));
    if (order === undefined || !canSeeOrder(c, services.secret, order)) {
      return c.redirect(lookupRedirect(c.req.param('number')), 303);
    }
    return render({
      title: `Order ${order.number} placed`,
      noindex: true,
      main: orderConfirmationPage(order),
    });
  });

  routes.get('/account/orders', requireUser(), async (c) => {
    const raw = c.req.query('page');
    if (raw === '1') return c.redirect('/account/orders', 301);
    const page = raw === undefined ? 1 : Number(raw);
    const user = c.get('user');
    if (user === undefined) return c.notFound(); // requireUser guarantees it
    const history = await memberOrderHistory(services.db, user.id, page);
    if (history === undefined) return c.notFound();
    const flash = takeFlash(c);
    return render({
      title: history.page === 1 ? 'Your orders' : `Your orders (page ${String(history.page)})`,
      noindex: true,
      main: orderHistoryPage({
        page: history.page,
        pages: history.pages,
        total: history.total,
        orders: history.orders.map((o) => ({
          number: o.number,
          status: o.status,
          placedAt: o.placedAt,
          total: { cents: o.totalCents, currency: 'USD' },
          itemCount: o.itemCount,
        })),
        ...(flash === undefined ? {} : { flash }),
      }),
    });
  });

  routes.get('/account/orders/:number', requireUser(), async (c) => {
    const user = c.get('user');
    const order = await findOrderDetail(services.db, c.req.param('number'));
    if (user === undefined || order === undefined) return c.notFound();
    const owner = order.userId === user.id;
    if (!owner && user.role !== 'admin') return c.notFound();
    const flash = takeFlash(c);
    const csrf = await csrfTokenFor(c);
    return render({
      title: `Order ${order.number}`,
      noindex: true,
      csrfToken: csrf,
      main: orderDetailPage(
        detailData(order, {
          back: { href: '/account/orders', label: 'Your orders' },
          ...(owner && order.canCancel
            ? { cancel: { action: `/account/orders/${order.number}/cancel`, csrf } }
            : {}),
          ...(flash === undefined ? {} : { flash }),
        }),
      ),
    });
  });

  routes.post('/account/orders/:number/cancel', requireUser(), async (c) => {
    const user = c.get('user');
    if (user === undefined) return c.notFound();
    const number = c.req.param('number');
    const result = await cancelMemberOrder(services, {
      userId: user.id,
      number,
      origin: new URL(c.req.url).origin,
    });
    if (!result.ok) {
      if (result.error._tag === 'NotFound') return c.notFound();
      setFlash(c, { kind: 'error', message: result.error.message });
    } else {
      setFlash(c, {
        kind: 'success',
        message:
          result.value.refunded === undefined
            ? 'Your order is cancelled. Our team will refund you within 2 business days.'
            : 'Your order is cancelled and your refund is on its way.',
      });
    }
    return c.redirect(`/account/orders/${number}`, 303);
  });

  const lookupForm = async (
    c: Context<AppEnv>,
    form: { number: string; email: string },
    error?: string,
  ) =>
    render({
      title: 'Find your order',
      noindex: true,
      status: error === undefined ? 200 : 422,
      csrfToken: await csrfTokenFor(c),
      main: orderLookupPage({
        csrf: await csrfTokenFor(c),
        ...form,
        ...(error === undefined ? {} : { error }),
      }),
    });

  routes.get('/order/lookup', (c) =>
    lookupForm(c, { number: c.req.query('number')?.slice(0, 40) ?? '', email: '' }),
  );

  routes.post('/order/lookup', async (c) => {
    const body = await c.req.parseBody();
    const parsed = v.safeParse(Lookup, {
      number: typeof body['number'] === 'string' ? body['number'] : '',
      email: typeof body['email'] === 'string' ? body['email'] : '',
    });
    const form = parsed.success ? parsed.output : { number: '', email: '' };
    const limited = await limit(c, lookupPerIp, [`ip:${ip(c)}`]);
    if (limited !== undefined) return limited;
    if (!parsed.success) return lookupForm(c, form, NOT_FOUND);
    const perOrder = await limit(c, lookupPerOrder, [`order:${form.number.toUpperCase()}`]);
    if (perOrder !== undefined) return perOrder;
    const number = await lookupGuestOrder(services.db, form.number, form.email);
    if (number === undefined) return lookupForm(c, form, NOT_FOUND);
    grantOrderAccess(c, services.secret, number);
    return c.redirect(`/order/${number}`, 303);
  });

  routes.get('/order/:number', async (c) => {
    const order = await findOrderDetail(services.db, c.req.param('number'));
    if (order === undefined || !canSeeOrder(c, services.secret, order)) {
      return c.redirect(lookupRedirect(c.req.param('number')), 303);
    }
    const user = c.get('user');
    if (user !== undefined && user.id === order.userId) {
      return c.redirect(`/account/orders/${order.number}`, 303);
    }
    return render({
      title: `Order ${order.number}`,
      noindex: true,
      main: orderDetailPage(
        detailData(order, { back: { href: '/order/lookup', label: 'Find another order' } }),
      ),
    });
  });

  return routes;
}

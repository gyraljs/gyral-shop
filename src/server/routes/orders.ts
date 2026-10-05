// Order pages: the confirmation shown after placing an order. Order history and guest lookup
// come with the orders bead (shop-935.4).
import { Hono } from 'hono';
import type { Services } from '../../services/container.js';
import { findOrderView } from '../../services/order-view.js';
import { orderConfirmationPage } from '../../ui/pages/order-confirmation.js';
import type { RenderPage } from '../document.js';
import { canSeeOrder } from '../order-access.js';
import type { AppEnv } from '../security/index.js';

export interface OrderRoutesOptions {
  readonly services: Services;
  readonly render: RenderPage;
}

export function orderRoutes({ services, render }: OrderRoutesOptions): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/order/:number/confirmation', async (c) => {
    const order = await findOrderView(services.db, c.req.param('number'));
    // Unknown and foreign orders look the same, so order numbers can't be probed.
    if (order === undefined || !canSeeOrder(c, services.secret, order)) return c.notFound();
    return render({
      title: `Order ${order.number} placed`,
      noindex: true,
      main: orderConfirmationPage(order),
    });
  });

  return routes;
}

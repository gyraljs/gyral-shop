// The admin (docs/product-specs/admin.md): a client-rendered app under /admin, backed by a JSON
// API under /api/admin. Every page and every API route requires an admin (requireAdmin), and
// the services check the role again (docs/design-docs/0002-security.md).
import { Hono, type Context } from 'hono';
import { html } from '@gyral/core';
import type { Services } from '../../services/container.js';
import { adminDashboard } from '../../services/admin-dashboard.js';
import { adminPageTitle } from '../../ui/admin/routes.js';
import '../../ui/admin/app.js'; // registers <shop-admin> for the server render
import type { RenderPage } from '../document.js';
import { csrfTokenFor, requireAdmin, type AppEnv } from '../security/index.js';
import { adminOrderRoutes } from './admin-orders.js';
import { adminManageRoutes } from './admin-manage.js';
import { adminProductRoutes } from './admin-products.js';
import { forbidden, NO_STORE } from './admin-http.js';

export interface AdminRoutesOptions {
  readonly services: Services;
  readonly render: RenderPage;
}

type C = Context<AppEnv>;

export function adminRoutes({ services, render }: AdminRoutesOptions): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  for (const path of ['/admin', '/admin/*', '/api/admin/*']) routes.use(path, requireAdmin());

  const shell = async (c: C) => {
    const url = new URL(c.req.url);
    const path = url.pathname + url.search;
    return render({
      title: adminPageTitle(path),
      noindex: true,
      csrfToken: await csrfTokenFor(c),
      main: html`<noscript>
          <section class="admin-page" data-region="admin-nojs">
            <h1>The admin needs JavaScript</h1>
            <p>Turn on JavaScript in your browser to manage products and orders.</p>
          </section>
        </noscript>
        <shop-admin .path=${path}></shop-admin>`,
    });
  };
  routes.get('/admin', shell);
  routes.get('/admin/*', shell);

  routes.get('/api/admin/dashboard', async (c) => {
    const result = await adminDashboard(services.db, c.get('user'), services.now());
    return result.ok ? c.json(result.value, 200, NO_STORE) : forbidden(c);
  });

  routes.route('/', adminProductRoutes(services));
  routes.route('/', adminOrderRoutes(services));
  routes.route('/', adminManageRoutes({ services }));
  return routes;
}

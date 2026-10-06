// /dev/mail: read the mock outbox in the browser (development only; docs/product-specs/mail.md).
import { Hono } from 'hono';
import type { Mailer } from '../../services/mail.js';
import { devMailListPage, devMailMessagePage } from '../../ui/pages/dev-mail.js';
import { pagePolicy } from '../csp.js';
import type { RenderPage } from '../document.js';
import type { AppEnv } from '../security/index.js';

/**
 * Mail HTML styles itself with `style` attributes (mail clients ignore stylesheets), and the
 * preview's srcdoc frame inherits this page's CSP, so a message page allows inline style
 * attributes, nothing else. Development only: production never mounts these routes.
 */
async function withMailStyles(response: Response, dev: boolean): Promise<Response> {
  response.headers.set(
    'content-security-policy',
    await pagePolicy({ dev, extra: { 'style-src-attr': "'unsafe-inline'" } }),
  );
  return response;
}

export function devMailRoutes(mailer: Mailer, render: RenderPage, dev: boolean): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.get('/', async () =>
    render({ title: 'Mail outbox', noindex: true, main: devMailListPage(await mailer.list()) }),
  );
  routes.get('/:id{[0-9]+}', async (c) => {
    const message = await mailer.get(Number(c.req.param('id')));
    if (message === undefined) return c.notFound();
    return withMailStyles(
      await render({ title: message.subject, noindex: true, main: devMailMessagePage(message) }),
      dev,
    );
  });
  return routes;
}

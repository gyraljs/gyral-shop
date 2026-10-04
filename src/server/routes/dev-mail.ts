// /dev/mail: read the mock outbox in the browser (development only; docs/product-specs/mail.md).
import { Hono } from 'hono';
import type { Mailer } from '../../services/mail.js';
import { devMailListPage, devMailMessagePage } from '../../ui/pages/dev-mail.js';

export type RenderPage = (options: {
  readonly title: string;
  readonly main: unknown;
  readonly noindex?: boolean;
}) => Promise<Response>;

export function devMailRoutes(mailer: Mailer, render: RenderPage): Hono {
  const routes = new Hono();
  routes.get('/', async () =>
    render({ title: 'Mail outbox', noindex: true, main: devMailListPage(await mailer.list()) }),
  );
  routes.get('/:id{[0-9]+}', async (c) => {
    const message = await mailer.get(Number(c.req.param('id')));
    if (message === undefined) return c.notFound();
    return render({ title: message.subject, noindex: true, main: devMailMessagePage(message) });
  });
  return routes;
}

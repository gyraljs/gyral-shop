import { Hono } from 'hono';
import { contextStorage, tryGetContext } from 'hono/context-storage';
import { firstName } from '../domain/accounts.js';
import type { Db } from '../db/client.js';
import { departmentLinks, homeData } from '../services/catalog.js';
import { createMailer } from '../services/mail.js';
import { homePage } from '../ui/pages/home.js';
import { notFoundPage, serverErrorPage } from '../ui/pages/errors.js';
import type { DepartmentLink } from '../ui/layout/site-header.js';
import { SECURITY_TITLES, securityErrorPage } from '../ui/pages/security-errors.js';
import { accountRoutes } from './routes/account.js';
import { catalogRoutes } from './routes/catalog.js';
import { SITE_NAME, shell, type ShellOptions } from './document.js';
import { installSecurity, type AppEnv, type SecurityOptions } from './security/index.js';
import { placeholderSvg } from './placeholder-image.js';
import { devMailRoutes } from './routes/dev-mail.js';

export interface AppOptions {
  /** URL of the browser entry module (Vite dev: `/src/client/entry.ts`). */
  readonly clientEntry: string;
  readonly db: Db;
  /** `production` disables development tools such as /dev/mail. Default `development`. */
  readonly mode?: 'development' | 'test' | 'production';
  /** Security settings other than the database (dev CSP, clock, proxy trust). */
  readonly security?: Omit<SecurityOptions, 'db' | 'render'>;
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#c8102e"/><text x="16" y="22" font-family="system-ui,sans-serif" font-size="17" font-weight="800" text-anchor="middle" fill="#fff">G</text></svg>`;

type PageOptions = Omit<ShellOptions, 'clientEntry' | 'departments' | 'account'>;

/** The signed-in member for the header, read from the current request (if any). */
function accountSummary(): ShellOptions['account'] {
  const c = tryGetContext<AppEnv>();
  const user = c?.get('user');
  const session = c?.get('session');
  return user === undefined || session === undefined
    ? undefined
    : { firstName: firstName(user.name), csrfToken: session.csrfToken };
}

export function createApp({
  clientEntry,
  db,
  mode = 'development',
  security,
}: AppOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  // Departments appear in every page's header; they change rarely, so load once per app.
  let departments: Promise<readonly DepartmentLink[]> | undefined;
  const nav = () => (departments ??= departmentLinks(db));
  const page = async (o: PageOptions) => {
    const account = accountSummary();
    return shell({
      ...o,
      clientEntry,
      departments: await nav(),
      ...(account === undefined ? {} : { account }),
    });
  };
  // Lets page() see the request's member without threading the context through every route.
  app.use('*', contextStorage());
  installSecurity(app, {
    ...security,
    db,
    render: (_c, kind, status, retryAfter) =>
      page({
        title: SECURITY_TITLES[kind],
        status,
        noindex: true,
        main: securityErrorPage(kind, retryAfter),
      }),
  });

  app.get(
    '/favicon.svg',
    () => new Response(FAVICON, { headers: { 'content-type': 'image/svg+xml' } }),
  );

  app.get('/img/p/:slug/:file', (c) => {
    const view = /^(\d{1,2})\.svg$/.exec(c.req.param('file'))?.[1];
    if (view === undefined) return c.notFound();
    return new Response(placeholderSvg(c.req.param('slug'), Number(view)), {
      headers: {
        'content-type': 'image/svg+xml',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  });

  app.get('/', async () => {
    const [data, departmentList] = await Promise.all([homeData(db), nav()]);
    return page({
      title: SITE_NAME,
      description: 'Electronics, home, clothing, toys, groceries and more, in one store.',
      main: homePage({ departments: departmentList, ...data }),
    });
  });

  app.route('/', catalogRoutes({ db, render: page }));
  const clock = security?.now;
  app.route(
    '/',
    accountRoutes({ db, render: page, now: () => (clock?.() ?? new Date()).getTime() }),
  );
  if (mode !== 'production') app.route('/dev/mail', devMailRoutes(createMailer(db), page));

  app.notFound(async (c) =>
    page({
      title: 'Page not found',
      status: 404,
      noindex: true,
      main: notFoundPage(new URL(c.req.url).pathname, await nav()),
    }),
  );

  app.onError(async (error) => {
    console.error(error);
    // The failure may be the database itself: never let the error page depend on it.
    const departmentList = await nav().catch(() => []);
    return shell({
      title: 'Something went wrong',
      status: 500,
      noindex: true,
      clientEntry,
      departments: departmentList,
      main: serverErrorPage(),
    });
  });

  return app;
}

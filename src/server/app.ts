import { Hono } from 'hono';
import { contextStorage, tryGetContext } from 'hono/context-storage';
import { firstName } from '../domain/accounts.js';
import type { Db } from '../db/client.js';
import { departmentLinks, homeData } from '../services/catalog.js';
import { createServices, type ServiceOptions, type Services } from '../services/container.js';
import { homePage } from '../ui/pages/home.js';
import { notFoundPage, serverErrorPage } from '../ui/pages/errors.js';
import type { DepartmentLink } from '../ui/layout/site-header.js';
import { SECURITY_TITLES, securityErrorPage } from '../ui/pages/security-errors.js';
import { accountRoutes } from './routes/account.js';
import { accountSettingsRoutes } from './routes/account-settings.js';
import { passwordResetRoutes } from './routes/password-reset.js';
import { contentRoutes } from './routes/content.js';
import { cartRoutes } from './routes/cart-api.js';
import { catalogRoutes } from './routes/catalog.js';
import { productRoutes } from './routes/product.js';
import { cartPageRoutes } from './routes/cart-page.js';
import { checkoutRoutes } from './routes/checkout.js';
import { orderRoutes } from './routes/orders.js';
import { adminRoutes } from './routes/admin.js';
import { cartStoreFor } from './cart-seed.js';
import { wishlistStoreFor } from './wishlist-seed.js';
import { wishlistRoutes } from './routes/wishlist.js';
import { searchRoutes } from './routes/search.js';
import { reviewRoutes } from './routes/reviews.js';
import { meRoutes } from './routes/me.js';
import { SITE_NAME, shell, type ShellOptions } from './document.js';
import { installSecurity, type AppEnv, type SecurityOptions } from './security/index.js';
import { placeholderSvg } from './placeholder-image.js';
import { productLabel } from '../db/repos/catalog.js';
import { devMailRoutes } from './routes/dev-mail.js';
import { seoRoutes } from './routes/seo.js';
import { consentRoutes } from './routes/consent.js';
import { analyticsMiddleware } from './analytics.js';
import { organizationJsonLd, twitterCard, websiteJsonLd } from './seo.js';
import { publicOrigin } from './origin.js';

export interface AppOptions {
  /** URL of the browser entry module (Vite dev: `/src/client/entry.ts`). */
  readonly clientEntry: string;
  readonly db: Db;
  /** `production` disables development tools such as /dev/mail. Default `development`. */
  readonly mode?: 'development' | 'test' | 'production';
  /** Security settings other than the database (dev CSP, clock, proxy trust). */
  readonly security?: Omit<SecurityOptions, 'db' | 'render'>;
  /** Service settings and replacements (payment latency, secret, fakes in tests). */
  readonly services?: Omit<ServiceOptions, 'db' | 'now'>;
  /** Public origin for absolute URLs (SITE_ORIGIN). Default: each request's own origin. */
  readonly siteOrigin?: string;
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#c8102e"/><text x="16" y="22" font-family="system-ui,sans-serif" font-size="17" font-weight="800" text-anchor="middle" fill="#fff">G</text></svg>`;

type PageOptions = Omit<ShellOptions, 'clientEntry' | 'departments' | 'account' | 'stores'>;

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
  services: serviceOptions,
  siteOrigin,
}: AppOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const clock = security?.now;
  const services: Services = createServices({
    ...serviceOptions,
    db,
    now: () => clock?.() ?? new Date(),
  });
  // Departments appear in every page's header; they change rarely, so load once per app.
  let departments: Promise<readonly DepartmentLink[]> | undefined;
  const nav = () => (departments ??= departmentLinks(db));
  const page = async (o: PageOptions) => {
    // Prerendered pages are the same for everyone: no account, token or cart in the HTML.
    if (o.static === true) return shell({ ...o, clientEntry, departments: await nav() });
    const account = accountSummary();
    const c = tryGetContext<AppEnv>();
    // The cart store is read by the header on every page (and by cart and product pages).
    const [departmentList, cart, wishlist] = await Promise.all([
      nav(),
      c === undefined ? undefined : cartStoreFor(db, c),
      c === undefined ? undefined : wishlistStoreFor(db, c),
    ]);
    // Browser code reads the token from <meta> for JSON requests (e.g. the cart store).
    const csrfToken = o.csrfToken ?? (c === undefined ? undefined : c.get('session')?.csrfToken);
    return shell({
      ...o,
      clientEntry,
      departments: departmentList,
      ...(account === undefined ? {} : { account }),
      ...(csrfToken === undefined ? {} : { csrfToken }),
      ...(cart === undefined || wishlist === undefined ? {} : { stores: [cart, wishlist] }),
    });
  };
  // Lets page() see the request's member without threading the context through every route.
  app.use('*', contextStorage());
  app.use('*', async (c, next) => {
    c.set('siteOrigin', siteOrigin);
    await next();
  });
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

  app.use('*', analyticsMiddleware(db)); // consented page views and add-to-cart only
  app.get(
    '/favicon.svg',
    () => new Response(FAVICON, { headers: { 'content-type': 'image/svg+xml' } }),
  );

  app.get('/img/p/:slug/:file', async (c) => {
    const view = /^(\d{1,2})\.svg$/.exec(c.req.param('file'))?.[1];
    if (view === undefined) return c.notFound();
    const slug = c.req.param('slug');
    const product = await productLabel(db, slug);
    return new Response(placeholderSvg(slug, Number(view), product), {
      headers: {
        'content-type': 'image/svg+xml',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  });

  app.get('/', async (c) => {
    const data = await homeData(db);
    const origin = publicOrigin(c);
    const canonical = new URL('/', origin).href;
    const description = 'Electronics, home, clothing, toys, groceries and more, in one store.';
    return page({
      title: SITE_NAME,
      description,
      canonical,
      jsonLd: [organizationJsonLd(origin, SITE_NAME), websiteJsonLd(origin, SITE_NAME)],
      meta: [
        ['og:type', 'website'],
        ['og:site_name', SITE_NAME],
        ['og:title', SITE_NAME],
        ['og:description', description],
        ['og:url', canonical],
      ],
      metaNames: twitterCard(undefined),
      main: homePage(data),
    });
  });

  app.route('/', seoRoutes({ db }));
  app.route('/', consentRoutes({ render: page }));
  app.route('/', catalogRoutes({ db, render: page }));
  const millis = () => services.now().getTime();
  app.route('/', accountRoutes({ db, render: page, now: millis }));
  app.route('/', accountSettingsRoutes({ db, render: page, now: millis }));
  app.route('/', passwordResetRoutes({ db, render: page, mailer: services.mailer, now: millis }));
  app.route('/', contentRoutes({ render: page, mailer: services.mailer, now: millis }));
  app.route('/', productRoutes({ db, render: page }));
  app.route('/', reviewRoutes({ db, render: page }));
  app.route('/', meRoutes());
  app.route('/', searchRoutes({ db, render: page }));
  app.route('/', cartRoutes(db));
  app.route('/', cartPageRoutes({ render: page }));
  app.route('/', checkoutRoutes({ db, render: page, services }));
  app.route('/', orderRoutes({ services, render: page }));
  app.route('/', wishlistRoutes({ db, render: page }));
  app.route('/', adminRoutes({ services, render: page }));
  if (mode !== 'production') app.route('/dev/mail', devMailRoutes(services.mailer, page));

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
      main: serverErrorPage(departmentList),
    });
  });

  return app;
}

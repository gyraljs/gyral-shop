import { Hono } from 'hono';
import { html } from '@gyral/core';
import { notFoundPage, serverErrorPage } from '../ui/pages/errors.js';
import type { DepartmentLink } from '../ui/layout/site-header.js';
import { SITE_NAME, shell, type ShellOptions } from './document.js';

export interface AppOptions {
  /** URL of the browser entry module (Vite dev: `/src/client/entry.ts`). */
  readonly clientEntry: string;
}

// Placeholder until the catalog repository exists (shop-jlx.2).
const DEPARTMENTS: readonly DepartmentLink[] = [
  { slug: 'electronics', name: 'Electronics' },
  { slug: 'home-kitchen', name: 'Home & Kitchen' },
  { slug: 'clothing', name: 'Clothing' },
  { slug: 'toys-games', name: 'Toys & Games' },
  { slug: 'grocery', name: 'Grocery' },
  { slug: 'beauty', name: 'Beauty' },
  { slug: 'sports-outdoors', name: 'Sports & Outdoors' },
  { slug: 'books', name: 'Books' },
];

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#c8102e"/><text x="16" y="22" font-family="system-ui,sans-serif" font-size="17" font-weight="800" text-anchor="middle" fill="#fff">G</text></svg>`;

type PageOptions = Omit<ShellOptions, 'clientEntry' | 'departments'>;

export function createApp(options: AppOptions): Hono {
  const app = new Hono();
  const page = (o: PageOptions) =>
    shell({ ...o, clientEntry: options.clientEntry, departments: DEPARTMENTS });

  app.get(
    '/favicon.svg',
    () => new Response(FAVICON, { headers: { 'content-type': 'image/svg+xml' } }),
  );

  app.get('/', () =>
    page({
      title: SITE_NAME,
      description: 'Everything for home, family and fun, in one store.',
      main: html`<h1>Welcome to ${SITE_NAME}</h1>
        <p>Electronics, home, clothing, toys, grocery and more.</p>`,
    }),
  );

  app.notFound((c) =>
    page({
      title: 'Page not found',
      status: 404,
      noindex: true,
      main: notFoundPage(new URL(c.req.url).pathname, DEPARTMENTS),
    }),
  );

  app.onError((error) => {
    console.error(error);
    return page({
      title: 'Something went wrong',
      status: 500,
      noindex: true,
      main: serverErrorPage(),
    });
  });

  return app;
}

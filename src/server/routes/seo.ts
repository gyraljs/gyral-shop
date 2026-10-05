// /sitemap.xml (or a sitemap index when the catalog outgrows one file) and /robots.txt.
import { Hono } from 'hono';
import type { Db } from '../../db/client.js';
import { sitemapRows } from '../../db/repos/sitemap.js';
import type { AppEnv } from '../security/index.js';
import {
  chunkSitemap,
  robotsTxt,
  sitemapIndexXml,
  urlsetXml,
  type SitemapEntry,
} from '../sitemap.js';
import { CONTENT_PATHS } from './content.js';

export interface SeoRouteOptions {
  readonly db: Db;
  /** Override for tests; production uses the protocol limit. */
  readonly perFile?: number;
}

const xml = (body: string) =>
  new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });

async function entries(db: Db, origin: string): Promise<SitemapEntry[]> {
  const rows = await sitemapRows(db);
  const at = (path: string) => new URL(path, origin).href;
  return [
    { loc: at('/') },
    ...CONTENT_PATHS.map((path) => ({ loc: at(path) })),
    ...rows.departments.map((d) => ({ loc: at(`/d/${d.slug}`), lastmod: d.lastmod })),
    ...rows.categories.map((c) => ({
      loc: at(`/c/${c.department}/${c.slug}`),
      lastmod: c.lastmod,
    })),
    ...rows.products.map((p) => ({ loc: at(`/p/${p.slug}`), lastmod: p.lastmod })),
  ];
}

export function seoRoutes({ db, perFile }: SeoRouteOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get('/robots.txt', (c) =>
    c.text(robotsTxt(new URL(c.req.url).origin), 200, { 'cache-control': 'public, max-age=3600' }),
  );

  app.get('/sitemap.xml', async (c) => {
    const { origin } = new URL(c.req.url);
    const files = chunkSitemap(await entries(db, origin), perFile);
    const [only] = files;
    if (files.length === 1 && only !== undefined) return xml(urlsetXml(only));
    return xml(
      sitemapIndexXml(files.map((_, n) => new URL(`/sitemaps/${String(n + 1)}.xml`, origin).href)),
    );
  });

  app.get('/sitemaps/:file', async (c) => {
    const n = /^(\d{1,4})\.xml$/.exec(c.req.param('file'))?.[1];
    if (n === undefined) return c.notFound();
    const files = chunkSitemap(await entries(db, new URL(c.req.url).origin), perFile);
    const file = files[Number(n) - 1];
    return file === undefined || files.length === 1 ? c.notFound() : xml(urlsetXml(file));
  });

  return app;
}

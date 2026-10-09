// SEO acceptance (docs/product-specs/seo.md): head tags per page template, structured-data
// shapes, sitemap and robots. Table-driven so a new template gets one row.
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { products } from '../../src/db/schema.js';
import { seoRoutes } from '../../src/server/routes/seo.js';
import { testApp, type TestApp } from '../support/app.js';
import { firstCategory } from '../support/catalog.js';

const ORIGIN = 'http://localhost';

interface Head {
  readonly status: number;
  readonly title: string;
  readonly description: string | undefined;
  readonly canonical: string | undefined;
  readonly noindex: boolean;
  readonly properties: ReadonlyMap<string, string>;
  readonly names: ReadonlyMap<string, string>;
  readonly jsonLd: readonly Record<string, unknown>[];
  readonly html: string;
}

const attr = (tag: string, name: string) =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1]?.replace(/&amp;/g, '&');

function readHead(status: number, html: string): Head {
  const metas = [...html.matchAll(/<meta\b[^>]*>/g)].map((m) => m[0]);
  const named = (n: string) => metas.find((m) => attr(m, 'name') === n);
  const pairs = (key: string) =>
    new Map(
      metas
        .filter((m) => attr(m, key) !== undefined && attr(m, 'content') !== undefined)
        .map((m) => [attr(m, key) ?? '', attr(m, 'content') ?? ''] as const),
    );
  const description = named('description');
  return {
    status,
    title: /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '',
    description: description === undefined ? undefined : attr(description, 'content'),
    canonical: attr(/<link rel="canonical"[^>]*>/.exec(html)?.[0] ?? '', 'href'),
    noindex: attr(named('robots') ?? '', 'content')?.includes('noindex') ?? false,
    properties: pairs('property'),
    names: pairs('name'),
    jsonLd: [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([^<]*)<\/script>/g)].map(
      (m) => JSON.parse(m[1] ?? '{}') as Record<string, unknown>,
    ),
    html,
  };
}

let test: TestApp;
let productSlug: string;
let category: string;
const heads = new Map<string, Head>();

async function head(path: string): Promise<Head> {
  const cached = heads.get(path);
  if (cached !== undefined) return cached;
  const response = await test.get(`${ORIGIN}${path}`);
  const result = readHead(response.status, await response.text());
  heads.set(path, result);
  return result;
}

beforeAll(async () => {
  test = await testApp();
  const [product] = await test.db.select({ slug: products.slug }).from(products).limit(1);
  productSlug = product?.slug ?? '';
  const first = await firstCategory(test.db, 'electronics');
  category = `/c/electronics/${first.slug}`;
});

/** [path, indexable]. Indexable pages need a description and a self-canonical. */
const templates = (): readonly (readonly [string, boolean])[] => [
  ['/', true],
  ['/d/electronics', true],
  [category, true],
  [`${category}?sale=1`, false],
  ['/search?q=kitchen', false],
  [`/p/${productSlug}`, true],
  ['/about', true],
  ['/faq', true],
  ['/terms', true],
  ['/privacy', true],
  ['/contact', true],
  ['/account/login', false],
  ['/account/register', false],
  ['/account/forgot', false],
  ['/cart', false],
  ['/no-such-page', false],
];

describe('head tags per template', () => {
  it('indexable pages have a description, a self-canonical and no noindex', async () => {
    for (const [path, indexable] of templates()) {
      const h = await head(path);
      if (!indexable) continue;
      expect(h.status, path).toBe(200);
      expect(h.noindex, path).toBe(false);
      expect(h.description?.length ?? 0, `${path} description`).toBeGreaterThan(30);
      expect(h.canonical, path).toBe(new URL(path, ORIGIN).href);
    }
  });

  it('personal, transactional, search, refined and error pages are noindex', async () => {
    for (const [path, indexable] of templates()) {
      if (!indexable) expect((await head(path)).noindex, path).toBe(true);
    }
  });

  it('refined listings canonicalize to the plain listing', async () => {
    expect((await head(`${category}?sale=1`)).canonical).toBe(new URL(category, ORIGIN).href);
  });

  it('every template has a distinct title', async () => {
    const titles = await Promise.all(templates().map(async ([p]) => (await head(p)).title));
    const indexable = titles.filter((_, i) => templates()[i]?.[1] === true);
    expect(new Set(indexable).size).toBe(indexable.length);
    for (const t of titles) expect(t).toMatch(/Gyral Goods/);
  });

  it('every image has an alt attribute; product gallery alts are descriptive', async () => {
    for (const path of ['/', '/d/electronics', category, `/p/${productSlug}`]) {
      const imgs = [...(await head(path)).html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
      for (const img of imgs) expect(img, path).toMatch(/\balt="/);
    }
    const product = (await head(`/p/${productSlug}`)).html;
    // Main gallery views are the 800×800 images.
    const views = [...product.matchAll(/<img\b[^>]*width="800"[^>]*>/g)];
    expect(views.length).toBeGreaterThan(0);
    for (const v of views) expect(attr(v[0], 'alt')?.length ?? 0).toBeGreaterThan(3);
  });
});

describe('social and structured data', () => {
  it('home: Organization and WebSite with a search action, Open Graph and Twitter', async () => {
    const h = await head('/');
    const org = h.jsonLd.find((d) => d['@type'] === 'Organization');
    expect(org).toMatchObject({
      '@context': 'https://schema.org',
      name: 'Gyral Goods',
      url: `${ORIGIN}/`,
    });
    const site = h.jsonLd.find((d) => d['@type'] === 'WebSite');
    expect(site).toMatchObject({
      potentialAction: {
        '@type': 'SearchAction',
        target: { urlTemplate: `${ORIGIN}/search?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    });
    expect(h.properties.get('og:type')).toBe('website');
    expect(h.properties.get('og:url')).toBe(`${ORIGIN}/`);
    expect(h.names.get('twitter:card')).toBe('summary');
  });

  it('product: Product offers and breadcrumbs have valid shapes', async () => {
    const h = await head(`/p/${productSlug}`);
    const product = h.jsonLd.find((d) => d['@type'] === 'Product');
    expect(product).toBeDefined();
    const offers = product?.['offers'] as Record<string, unknown>;
    expect(['Offer', 'AggregateOffer']).toContain(offers['@type']);
    expect(offers['priceCurrency']).toBe('USD');
    expect(String(offers['availability'])).toMatch(/^https:\/\/schema\.org\/(InStock|OutOfStock)$/);
    for (const key of ['price', 'lowPrice', 'highPrice']) {
      if (key in offers) expect(String(offers[key])).toMatch(/^\d+\.\d{2}$/);
    }
    const crumbs = h.jsonLd.find((d) => d['@type'] === 'BreadcrumbList');
    const items = crumbs?.['itemListElement'] as Record<string, unknown>[];
    expect(items.map((i) => i['position'])).toEqual(items.map((_, n) => n + 1));
    for (const i of items) expect(String(i['item'])).toMatch(/^http:\/\/localhost\//);
    expect(h.properties.get('og:type')).toBe('product');
    expect(h.names.get('twitter:card')).toBe('summary_large_image');
  });
});

describe('sitemap.xml and robots.txt', () => {
  it('lists home, content, departments, categories and live products with lastmod', async () => {
    const response = await test.get(`${ORIGIN}/sitemap.xml`);
    expect(response.headers.get('content-type')).toMatch(/application\/xml/);
    const xml = await response.text();
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset /);
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    for (const path of [
      '/',
      '/about',
      '/faq',
      '/contact',
      '/d/electronics',
      category,
      `/p/${productSlug}`,
    ]) {
      expect(locs, path).toContain(new URL(path, ORIGIN).href);
    }
    expect(locs.some((l) => l?.includes('/account') || l?.includes('/cart'))).toBe(false);
    expect(xml).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  it('leaves archived products out', async () => {
    const own = await testApp();
    const [p] = await own.db
      .select({ id: products.id, slug: products.slug })
      .from(products)
      .limit(1);
    if (p === undefined) throw new Error('no products');
    await own.db.update(products).set({ archived: true }).where(eq(products.id, p.id));
    expect(await (await own.get('/sitemap.xml')).text()).not.toContain(`/p/${p.slug}<`);
  });

  it('becomes an index of numbered files when entries exceed one file', async () => {
    const app = new Hono().route('/', seoRoutes({ db: test.db, perFile: 25 }));
    const index = await (await app.request(`${ORIGIN}/sitemap.xml`)).text();
    const files = [...index.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1] ?? '');
    expect(index).toMatch(/<sitemapindex /);
    expect(files.length).toBeGreaterThan(1);
    const first = await (await app.request(files[0] ?? '')).text();
    expect([...first.matchAll(/<url>/g)]).toHaveLength(25);
    expect((await app.request(`${ORIGIN}/sitemaps/999.xml`)).status).toBe(404);
  });

  it('robots.txt disallows private paths and links the sitemap', async () => {
    const text = await (await test.get(`${ORIGIN}/robots.txt`)).text();
    for (const p of ['/account', '/cart', '/checkout', '/admin', '/api/']) {
      expect(text).toContain(`Disallow: ${p}`);
    }
    expect(text).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });
});

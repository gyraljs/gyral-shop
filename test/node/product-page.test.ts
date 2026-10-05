import { describe, expect, it } from 'vitest';
import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../src/db/client.js';
import { findProduct, ratingDistribution, topReviews } from '../../src/db/repos/product.js';
import { products, variants } from '../../src/db/schema.js';
import { metaDescription } from '../../src/server/routes/product.js';
import { productPage, reviewerName } from '../../src/services/product.js';
import { stableHtml } from '../support/fixtures.js';
import { testApp } from '../support/app.js';

/** Collapses Lit's comment markers so assertions can read rendered text. */
const text = (html: string) => html.replace(/<!--[^>]*-->/g, '');

/** The seeded product with the most variants (an apparel item with Color × Size). */
async function multiVariantProduct(db: Db) {
  const [row] = await db
    .select({ id: products.id, slug: products.slug, n: sql<number>`count(${variants.id})` })
    .from(products)
    .innerJoin(variants, eq(variants.productId, products.id))
    .groupBy(products.id)
    .orderBy(desc(sql`count(${variants.id})`), products.id)
    .limit(1);
  if (row === undefined) throw new Error('no products');
  return row;
}

/** Makes stock deterministic: the first SKU in stock, the second sold out. */
async function setStock(db: Db, productId: number) {
  const skus = await db
    .select({ id: variants.id })
    .from(variants)
    .where(eq(variants.productId, productId))
    .orderBy(variants.position, variants.id);
  for (const [i, sku] of skus.entries()) {
    await db
      .update(variants)
      .set({ stock: i === 1 ? 0 : 20 })
      .where(eq(variants.id, sku.id));
  }
}

const jsonLd = (html: string) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1] ?? 'null') as Record<string, unknown>,
  );

describe('product repository and service', () => {
  it('loads a product with ordered variants, images and review data', async () => {
    const { db } = await testApp();
    const { id, slug, n } = await multiVariantProduct(db);
    const detail = await findProduct(db, slug);
    expect(detail?.product.id).toBe(id);
    expect(detail?.variants).toHaveLength(n);
    expect(detail?.images.length).toBeGreaterThanOrEqual(2);
    const distribution = await ratingDistribution(db, id);
    const total = [...distribution.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(detail?.product.ratingCount);
    expect((await topReviews(db, id, 5)).length).toBe(Math.min(5, total));
  });

  it('hides archived products and unknown slugs', async () => {
    const { db } = await testApp();
    const { id, slug } = await multiVariantProduct(db);
    await db.update(products).set({ archived: true }).where(eq(products.id, id));
    expect(await findProduct(db, slug)).toBeUndefined();
    expect(await findProduct(db, 'no-such-product')).toBeUndefined();
  });

  it('shapes page data: effective prices, review authors, related without itself', async () => {
    const { db } = await testApp();
    const { slug } = await multiVariantProduct(db);
    const data = await productPage(db, slug);
    expect(data?.related.map((c) => c.slug)).not.toContain(slug);
    expect(data?.rating.distribution.map((d) => d.stars)).toEqual([5, 4, 3, 2, 1]);
    for (const review of data?.reviews ?? []) expect(review.author).toMatch(/^\S+( \S\.)?$/);
    expect(reviewerName('Ada Lovelace')).toBe('Ada L.');
    expect(reviewerName('Cher')).toBe('Cher');
  });

  it('keeps meta descriptions short and cut at a word', () => {
    expect(metaDescription('short')).toBe('short');
    const long = metaDescription('word '.repeat(80));
    expect(long.length).toBeLessThanOrEqual(155);
    expect(long.endsWith('word…')).toBe(true);
  });
});

describe('product page route', () => {
  it('renders the page with title, canonical, Open Graph and breadcrumbs', async () => {
    const { db, get } = await testApp();
    const { slug } = await multiVariantProduct(db);
    const data = await productPage(db, slug);
    const res = await get(`/p/${slug}`);
    const body = text(await res.text());
    expect(res.status).toBe(200);
    expect(body).toContain(`<link rel="canonical" href="http://localhost/p/${slug}"`);
    expect(body).toContain('<meta property="og:type" content="product"');
    expect(body).toContain(`<h1>${data?.name ?? ''}</h1>`);
    expect(body).toContain('aria-label="Breadcrumb"');
    expect(body).toContain('Customer reviews');
    expect(res.headers.get('set-cookie')).toMatch(/sid=/); // the add-to-cart form needs a session
  });

  it('writes valid Product and BreadcrumbList structured data', async () => {
    const { db, html } = await testApp();
    const { slug, id } = await multiVariantProduct(db);
    await setStock(db, id);
    const [product, crumbs] = jsonLd(await html(`/p/${slug}`));
    expect(product?.['@type']).toBe('Product');
    expect(product?.['url']).toBe(`http://localhost/p/${slug}`);
    expect((product?.['image'] as string[]).every((u) => u.startsWith('http://localhost/'))).toBe(
      true,
    );
    const offers = product?.['offers'] as Record<string, unknown>;
    expect(offers['@type']).toBe('AggregateOffer');
    expect(offers['priceCurrency']).toBe('USD');
    expect(offers['availability']).toBe('https://schema.org/InStock');
    expect(Number(offers['lowPrice'])).toBeLessThanOrEqual(Number(offers['highPrice']));
    expect(crumbs?.['@type']).toBe('BreadcrumbList');
    expect((crumbs?.['itemListElement'] as unknown[]).length).toBe(4);
  });

  it('renders a no-JS form: every SKU a radio, sold-out SKUs disabled, CSRF and quantity', async () => {
    const { db, html } = await testApp();
    const { slug, id, n } = await multiVariantProduct(db);
    await setStock(db, id);
    const body = text(await html(`/p/${slug}`));
    expect(body).toMatch(/<form method="post" action="\/cart\/add"[^>]*>/);
    expect(body.match(/type="radio"\s+name="sku"/g)).toHaveLength(n);
    expect(body.match(/name="sku"[^>]*disabled/g)).toHaveLength(1);
    expect(body).toMatch(/<input type="hidden" name="_csrf" value="[\w-]{20,}"/);
    expect(body).toMatch(/name="quantity"\s+type="number"/);
  });

  it('answers unknown products with the 404 page', async () => {
    const { get } = await testApp();
    expect((await get('/p/no-such-product')).status).toBe(404);
  });

  it('is linked from product cards', async () => {
    const { html } = await testApp();
    expect(await html('/')).toMatch(/<a href="\/p\/[a-z0-9-]+">/);
  });

  it('matches the golden SSR output used by the browser tests', async () => {
    const { db, html } = await testApp();
    const { slug, id } = await multiVariantProduct(db);
    await setStock(db, id);
    const page = await html(`/p/${slug}`);
    // The CSRF token is random per session: pin it so the fixture is stable.
    const token = /name="_csrf" value="([^"]+)"/.exec(page)?.[1] ?? '';
    expect(token).not.toBe('');
    await expect(stableHtml(page.replaceAll(token, 'test-csrf-token'))).toMatchFileSnapshot(
      '../fixtures/product.ssr.html',
    );
  });
});

// Listing filters, sort and their URLs (docs/product-specs/catalog.md, seo.md).
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { products } from '../../src/db/schema.js';
import { DEFAULT_LISTING, type ListingState } from '../../src/domain/listing.js';
import { categoryPage } from '../../src/services/departments.js';
import { testApp } from '../support/app.js';
import { fixtureCategory, names } from '../support/listing.js';

const text = (html: string) => html.replace(/<!--[^>]*-->/g, '');

async function listing(state: Partial<ListingState>) {
  const { db } = await testApp();
  const { slug } = await fixtureCategory(db);
  const result = await categoryPage(db, 'electronics', slug, { ...DEFAULT_LISTING, ...state });
  if (result._tag !== 'Found') throw new Error(result._tag);
  return result.data;
}

describe('listing queries', () => {
  it('ranks by rating for "featured", unrated last', async () => {
    const data = await listing({});
    expect(names(data.cards)).toEqual([
      'Delta',
      'Alpha',
      'Foxtrot',
      'Golf',
      'Bravo',
      'Echo',
      'Hotel',
      'Charlie',
    ]);
  });

  it('ranks one 5-star review below many 4.6-star reviews (Bayesian average)', async () => {
    const { db } = await testApp();
    const { slug } = await fixtureCategory(db);
    const rate = (name: string, sum: number, n: number) =>
      db.update(products).set({ ratingSum: sum, ratingCount: n }).where(eq(products.name, name));
    await rate('Delta', 5, 1); // a single 5-star review
    await rate('Alpha', 230, 50); // fifty reviews averaging 4.6
    const result = await categoryPage(db, 'electronics', slug, {
      ...DEFAULT_LISTING,
      sort: 'rating',
    });
    if (result._tag !== 'Found') throw new Error(result._tag);
    const cards = names(result.data.cards);
    expect(cards.indexOf('Alpha')).toBeLessThan(cards.indexOf('Delta'));
    expect(cards.at(-1)).toBe('Charlie'); // unrated stays last
  });

  it('sorts by the price a shopper pays (sale price when on sale), both ways', async () => {
    const ascending = ['Foxtrot', 'Alpha', 'Bravo', 'Hotel', 'Charlie', 'Delta', 'Echo', 'Golf'];
    expect(names((await listing({ sort: 'price-asc' })).cards)).toEqual(ascending);
    expect(names((await listing({ sort: 'price-desc' })).cards)).toEqual([...ascending].reverse());
  });

  it('sorts newest first', async () => {
    expect(names((await listing({ sort: 'newest' })).cards)[0]).toBe('Hotel');
  });

  it('filters by an inclusive price range on the paid price', async () => {
    const data = await listing({ minPrice: 19, maxPrice: 45, sort: 'price-asc' });
    expect(names(data.cards)).toEqual(['Bravo', 'Hotel', 'Charlie', 'Delta']);
    expect(data.total).toBe(4);
  });

  it('filters by brand, minimum rating, stock and sale, combined', async () => {
    expect(names((await listing({ brands: ['zenith'] })).cards)).toEqual([
      'Delta',
      'Foxtrot',
      'Echo',
      'Hotel',
    ]);
    expect(names((await listing({ rating: 4 })).cards)).toEqual(['Delta', 'Alpha', 'Foxtrot']);
    expect((await listing({ inStock: true })).total).toBe(6);
    expect(names((await listing({ onSale: true })).cards)).toEqual(['Delta', 'Golf', 'Bravo']);
    expect(names((await listing({ onSale: true, brands: ['acme'], inStock: true })).cards)).toEqual(
      ['Golf'],
    );
  });

  it('counts brand facets with every filter except brand', async () => {
    const data = await listing({ onSale: true, brands: ['acme'] });
    expect(data.brands).toEqual([
      { slug: 'acme', name: 'Acme', count: 2 },
      { slug: 'zenith', name: 'Zenith', count: 1 },
    ]);
  });

  it('keeps a selected brand that no longer matches, so it can be unchecked', async () => {
    const data = await listing({ brands: ['zenith'], minPrice: 80 });
    expect(data.total).toBe(0);
    expect(data.brands.map((b) => [b.slug, b.count])).toEqual([
      ['acme', 1],
      ['zenith', 0],
    ]);
  });
});

describe('listing routes', () => {
  it('redirects what a no-JS filter form submits to the canonical URL', async () => {
    const { db, get } = await testApp();
    const { path } = await fixtureCategory(db);
    const res = await get(`${path}?sort=relevance&min=&max=45&brand=zenith&rating=&sale=1`);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`${path}?max=45&brand=zenith&sale=1`);
  });

  it('renders a filtered listing with noindex, canonical to the plain listing, checked controls', async () => {
    const { db, get } = await testApp();
    const { path } = await fixtureCategory(db);
    const res = await get(`${path}?brand=zenith&stock=1`);
    const body = text(await res.text());
    expect(res.status).toBe(200);
    expect(body).toContain('<meta name="robots" content="noindex"');
    expect(body).toContain(`<link rel="canonical" href="http://localhost${path}"`);
    expect(body).toContain('Showing 1–3 of 3 products');
    expect(body).toMatch(/name="brand"\s+value="zenith"\s+checked/);
    expect(body).toMatch(/name="stock"\s+value="1"\s+checked/);
    // Unselected boxes must carry no `checked` attribute at all (`checked="false"` checks them).
    expect(body).toMatch(/name="brand"\s+value="acme"\s*\/>/);
    expect(body).toMatch(/name="sale"\s+value="1"\s*\/>/);
    expect(body).not.toContain('checked="');
  });

  it('wraps the filters in a disclosure, open with an active count only when filters apply', async () => {
    const { db, get } = await testApp();
    const { path } = await fixtureCategory(db);
    const plain = text(await (await get(path)).text());
    expect(plain).toMatch(/<details class="filters-panel" data-component="filters-panel"\s*>/);
    expect(plain).toMatch(/<summary>\s*Filter and\s+sort\s*<\/summary>/);

    // The form submits fields in its own order; the server redirects to the canonical query.
    let res = await get(`${path}?brand=zenith&stock=1&sort=price-asc`);
    const location = res.headers.get('location');
    if (res.status === 301 && location !== null) res = await get(location);
    expect(res.status).toBe(200);
    const filtered = text(await res.text());
    expect(filtered).toMatch(
      /<details class="filters-panel" data-component="filters-panel"\s+open/,
    );
    expect(filtered).toContain('<span class="count">(2 active)</span>'); // sort isn't a filter
  });

  it('keeps the query in pager links of a filtered listing', async () => {
    const { db, get } = await testApp();
    const { path } = await fixtureCategory(db);
    const [hotel] = await db.select().from(products).where(eq(products.slug, 'fixture-hotel'));
    if (hotel === undefined) throw new Error('no fixture product');
    const copy: typeof products.$inferInsert = { ...hotel };
    delete copy.id;
    await db
      .insert(products)
      .values(
        Array.from({ length: 30 }, (_, n) => ({ ...copy, slug: `zenith-extra-${String(n)}` })),
      );
    const body = text(await (await get(`${path}?brand=zenith&page=2`)).text());
    expect(body).toContain(`href="${path}?brand=zenith" rel="prev"`);
    expect(body).toContain('Showing 25–34 of 34 products');
  });

  it('answers the same listing as JSON for in-page updates, leniently', async () => {
    const { db, get } = await testApp();
    const { path } = await fixtureCategory(db);
    const res = await get(`/api/listing${path}?sale=1&sort=relevance`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as {
      basePath: string;
      state: ListingState;
      cards: { name: string }[];
      total: number;
    };
    expect(body.basePath).toBe(path);
    expect(body.state).toEqual({ ...DEFAULT_LISTING, onSale: true });
    expect(names(body.cards)).toEqual(['Delta', 'Golf', 'Bravo']);
    expect((await get('/api/listing/c/electronics/no-such-category')).status).toBe(404);
  });

  it('produces the markup and JSON the browser listing test uses', async () => {
    // Golden files for test/browser/listing.test.ts. Regenerate with `pnpm test -u`.
    const { db, html, get } = await testApp();
    const { path } = await fixtureCategory(db);
    await expect(await html(path)).toMatchFileSnapshot('../fixtures/listing.ssr.html');
    const sale = await (await get(`/api/listing${path}?sale=1`)).text();
    await expect(sale).toMatchFileSnapshot('../fixtures/listing-sale.json');
    const base = await (await get(`/api/listing${path}`)).text();
    await expect(base).toMatchFileSnapshot('../fixtures/listing-base.json');
  });
});

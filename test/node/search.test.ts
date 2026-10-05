// Search (docs/product-specs/search.md): ranking, escaping, index sync and the routes.
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { Db } from '../../src/db/client.js';
import { brands, products } from '../../src/db/schema.js';
import { DEFAULT_LISTING, type ListingState } from '../../src/domain/listing.js';
import { searchPage } from '../../src/services/search.js';
import { testApp } from '../support/app.js';
import { firstCategory } from '../support/catalog.js';

const text = (html: string) => html.replace(/<!--[^>]*-->/g, '');

/**
 * Four products where "quokka" appears in exactly one place each: the name, the brand, the
 * description, or nowhere (a control). Names are otherwise unique words in the catalog.
 */
async function fixture(db: Db) {
  const category = await firstCategory(db, 'electronics');
  const [template] = await db.select().from(products).where(eq(products.categoryId, category.id));
  if (template === undefined) throw new Error('no template product');
  const [quokkaBrand] = await db
    .insert(brands)
    .values({ slug: 'quokka-works', name: 'Quokka Works' })
    .returning({ id: brands.id });
  if (quokkaBrand === undefined) throw new Error('brand not inserted');
  const base: typeof products.$inferInsert = { ...template };
  delete base.id;
  const add = (slug: string, values: Partial<typeof products.$inferInsert>) =>
    db
      .insert(products)
      .values({ ...base, slug, ...values })
      .returning({ id: products.id });
  const [byName] = await add('quokka-lamp', {
    name: 'Quokka Lamp',
    description: 'A warm light.',
    priceCents: 3000,
    salePriceCents: null,
  });
  await add('desk-fan', {
    name: 'Zircon Desk Fan',
    brandId: quokkaBrand.id,
    description: 'Moves air.',
    priceCents: 1000,
    salePriceCents: null,
  });
  await add('plain-stool', {
    name: 'Zircon Plain Stool',
    description: 'Sturdy enough for a quokka.',
    priceCents: 2000,
    salePriceCents: 1500,
  });
  await add('cafe-press', { name: 'Café Press', description: 'Brews coffee.' });
  if (byName === undefined) throw new Error('product not inserted');
  return { byName };
}

async function search(q: string, state: Partial<ListingState> = {}) {
  const { db } = await testApp();
  await fixture(db);
  const result = await searchPage(db, q, { ...DEFAULT_LISTING, ...state });
  if (result._tag !== 'Found') throw new Error(result._tag);
  return { db, data: result.data };
}

const names = (cards: readonly { readonly name: string }[]) => cards.map((c) => c.name);

describe('search repository', () => {
  it('ranks name matches above brand matches above description matches', async () => {
    const { data } = await search('quokka');
    expect(names(data.cards)).toEqual(['Quokka Lamp', 'Zircon Desk Fan', 'Zircon Plain Stool']);
    expect(data.total).toBe(3);
  });

  it('matches word prefixes, every word, any case, ignoring accents', async () => {
    expect(names((await search('QUOK')).data.cards)).toHaveLength(3);
    expect(names((await search('zircon stool')).data.cards)).toEqual(['Zircon Plain Stool']);
    expect(names((await search('cafe')).data.cards)).toEqual(['Café Press']);
    expect(names((await search('café')).data.cards)).toEqual(['Café Press']);
  });

  it('treats FTS syntax and SQL in the query as plain words', async () => {
    // Punctuation is only a separator: these all mean "quokka".
    for (const q of ['quokka"', '"quokka', 'quokka*', '(quokka)', 'quokka:']) {
      expect((await search(q)).data.total, q).toBe(3);
    }
    // Operators are ordinary words that must also match (none do), never syntax errors.
    for (const q of [
      'quokka OR lamp',
      'NEAR(quokka',
      'quokka AND NOT',
      "quokka'; drop table products; --",
    ]) {
      expect((await search(q)).data.total, q).toBe(0);
    }
    expect((await search('quokka lamp')).data.total).toBe(1);
    expect((await search('***')).data.total).toBe(0);
    expect((await search('"" () -')).data.suggestions).toBeDefined();
  });

  it('combines with listing filters and sorts', async () => {
    expect(names((await search('quokka', { sort: 'price-asc' })).data.cards)).toEqual([
      'Zircon Desk Fan',
      'Zircon Plain Stool',
      'Quokka Lamp',
    ]);
    expect(names((await search('quokka', { onSale: true })).data.cards)).toEqual([
      'Zircon Plain Stool',
    ]);
    const { data } = await search('quokka', { brands: ['quokka-works'] });
    expect(names(data.cards)).toEqual(['Zircon Desk Fan']);
    expect(data.brands.find((b) => b.slug === 'quokka-works')?.count).toBe(1);
  });

  it('keeps the index in sync when products change, and skips archived ones', async () => {
    const { db } = await testApp();
    const { byName } = await fixture(db);
    await db.update(products).set({ name: 'Wombat Lamp' }).where(eq(products.id, byName.id));
    const state = DEFAULT_LISTING;
    const renamed = await searchPage(db, 'wombat', state);
    expect(renamed._tag === 'Found' ? names(renamed.data.cards) : []).toEqual(['Wombat Lamp']);
    await db.update(products).set({ archived: true }).where(eq(products.id, byName.id));
    const archived = await searchPage(db, 'wombat', state);
    expect(archived._tag === 'Found' ? archived.data.total : -1).toBe(0);
  });

  it('suggests departments and popular products when nothing matches', async () => {
    const { data } = await search('xylophonequartz');
    expect(data.total).toBe(0);
    expect(data.suggestions?.departments.length).toBeGreaterThan(0);
    expect(data.suggestions?.popular.length).toBeGreaterThan(0);
  });
});

describe('search routes', () => {
  async function app() {
    const t = await testApp();
    await fixture(t.db);
    return t;
  }

  it('renders results with the listing component, noindex and a title', async () => {
    const t = await app();
    const res = await t.get('/search?q=quokka');
    expect(res.status).toBe(200);
    const page = text(await res.text());
    expect(page).toContain('<title>Results for “quokka” — Gyral Goods</title>');
    expect(page).toContain('<meta name="robots" content="noindex"');
    expect(page).toContain('<shop-listing');
    expect(page.indexOf('Quokka Lamp')).toBeLessThan(page.indexOf('Zircon Desk Fan'));
    expect(page).toContain('<option value="relevance"');
    expect(page).toContain('Best match');
    // The no-JS filter form keeps the query.
    expect(page).toMatch(/<input type="hidden" name="q" value="quokka"/);
    // The header search box echoes it.
    expect(page).toMatch(/type="search"[^>]*value="quokka"|value="quokka"[^>]*type="search"/);
  });

  it('redirects non-canonical searches once', async () => {
    const t = await app();
    const cases: [string, string][] = [
      ['/search?q=%20quokka%20%20lamp%20', '/search?q=quokka+lamp'],
      ['/search?q=quokka&page=1', '/search?q=quokka'],
      ['/search?q=quokka&sort=relevance&min=&sale=1', '/search?q=quokka&sale=1'],
      ['/search?q=', '/search'],
      ['/search?q=%20&sale=1', '/search'],
    ];
    for (const [from, to] of cases) {
      const res = await t.get(from);
      expect(res.status, from).toBe(301);
      expect(
        new URL(res.headers.get('location') ?? '', 'http://x').pathname +
          new URL(res.headers.get('location') ?? '', 'http://x').search,
        from,
      ).toBe(to);
    }
  });

  it('asks for a query on /search and shows a no-results page for misses', async () => {
    const t = await app();
    const empty = text(await t.html('/search'));
    expect(empty).toContain('<h1>Search</h1>');
    expect(empty).toContain('Browse departments');
    const miss = await t.get('/search?q=xylophonequartz');
    expect(miss.status).toBe(200);
    const missPage = text(await miss.text());
    expect(missPage).toContain('No products match “xylophonequartz”');
    expect(missPage).toContain('Popular right now');
    expect(missPage).not.toContain('<shop-listing');
  });

  it('answers special characters safely', async () => {
    const t = await app();
    for (const q of [
      '"',
      'NEAR(',
      '*',
      "'; drop table products; --",
      '<script>alert(1)</script>',
    ]) {
      const res = await t.get(`/search?q=${encodeURIComponent(q)}`);
      expect(res.status, q).toBe(200);
      expect(await res.text(), q).not.toContain('<script>alert(1)</script>');
    }
  });

  it('404s for pages past the end', async () => {
    const t = await app();
    expect((await t.get('/search?q=quokka&page=9')).status).toBe(404);
  });

  it('serves the same listing as JSON for in-page updates', async () => {
    const t = await app();
    const res = await t.get('/api/listing/search?q=quokka&sort=price-asc');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      fixedQuery: string;
      cards: { name: string }[];
      state: { sort: string };
    };
    expect(body.fixedQuery).toBe('q=quokka');
    expect(body.state.sort).toBe('price-asc');
    expect(names(body.cards)).toEqual(['Zircon Desk Fan', 'Zircon Plain Stool', 'Quokka Lamp']);
    expect((await t.get('/api/listing/search')).status).toBe(400);
    expect((await t.get('/api/listing/search?q=quokka&page=9')).status).toBe(404);
  });

  it('produces the markup and JSON the browser search test uses', async () => {
    // Golden files for test/browser/search.test.ts. Regenerate with `pnpm test -u`.
    const t = await app();
    await expect(await t.html('/search?q=quokka')).toMatchFileSnapshot(
      '../fixtures/search.ssr.html',
    );
    const sale = await (await t.get('/api/listing/search?q=quokka&sale=1')).text();
    await expect(sale).toMatchFileSnapshot('../fixtures/search-sale.json');
    const base = await (await t.get('/api/listing/search?q=quokka')).text();
    await expect(base).toMatchFileSnapshot('../fixtures/search-base.json');
  });
});

import { describe, expect, it } from 'vitest';
import {
  categoryCounts,
  countProducts,
  findCategory,
  productCards,
} from '../../src/db/repos/catalog.js';
import { PAGE_SIZE } from '../../src/domain/listing.js';
import { testApp } from '../support/app.js';
import { addProducts, archiveOne, firstCategory } from '../support/catalog.js';

/** Collapses Lit's comment markers so assertions can read rendered text. */
const text = (html: string) => html.replace(/<!--[^>]*-->/g, '');

describe('catalog repository', () => {
  it('finds a category through its department slug, and nothing across departments', async () => {
    const { db } = await testApp();
    const category = await firstCategory(db, 'electronics');
    const found = await findCategory(db, 'electronics', category.slug);
    expect(found?.category.id).toBe(category.id);
    expect(found?.department.slug).toBe('electronics');
    expect(await findCategory(db, 'books', category.slug)).toBeUndefined();
  });

  it('counts and pages through the same products the cards show', async () => {
    const { db } = await testApp();
    const { id } = await firstCategory(db, 'electronics');
    await addProducts(db, id, 30);
    await archiveOne(db, id);
    const total = await countProducts(db, { categoryId: id });
    expect(total).toBe(2 + 30 - 1); // seeded two per category, plus 30, minus one archived
    const first = await productCards(db, { categoryId: id, order: 'rating', limit: PAGE_SIZE });
    const second = await productCards(db, {
      categoryId: id,
      order: 'rating',
      limit: PAGE_SIZE,
      offset: PAGE_SIZE,
    });
    expect(first).toHaveLength(PAGE_SIZE);
    expect(second).toHaveLength(total - PAGE_SIZE);
    const slugs = [...first, ...second].map((p) => p.slug);
    expect(new Set(slugs).size).toBe(total); // stable order: no duplicates across pages
  });

  it('counts products per category of a department', async () => {
    const { db } = await testApp();
    const { id, departmentId } = await firstCategory(db, 'books');
    await addProducts(db, id, 3);
    const counts = await categoryCounts(db, departmentId);
    expect(counts.get(id)).toBe(5);
    expect([...counts.values()].every((n) => n >= 2)).toBe(true);
  });
});

describe('department page', () => {
  it('lists categories with counts, deals and top rated, with breadcrumbs and canonical', async () => {
    const { get } = await testApp();
    const res = await get('/d/electronics');
    const body = text(await res.text());
    expect(res.status).toBe(200);
    expect(body).toContain('<title>Electronics — Gyral Goods</title>');
    expect(body).toContain('<h1>Electronics</h1>');
    expect(body).toContain('<link rel="canonical" href="http://localhost/d/electronics"');
    expect(body).toMatch(/<a href="\/c\/electronics\/[a-z-]+">\s*<span class="name">/);
    expect(body).toContain('2 products');
    expect(body).toContain('Top rated in Electronics');
    expect(body).toContain('aria-label="Breadcrumb"');
    expect(body).toContain('"@type":"BreadcrumbList"');
    expect(body).toContain('"item":"http://localhost/d/electronics"');
  });

  it('marks the department as current in the header', async () => {
    const { html } = await testApp();
    expect(await html('/d/books')).toMatch(/current="books"/);
  });

  it('answers an unknown department with the 404 page', async () => {
    const { get } = await testApp();
    const res = await get('/d/no-such-department');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('We couldn');
  });
});

describe('category page', () => {
  it('server-renders a page of product cards with side navigation', async () => {
    const { db, get } = await testApp();
    const category = await firstCategory(db, 'electronics');
    const res = await get(`/c/electronics/${category.slug}`);
    const body = text(await res.text());
    expect(res.status).toBe(200);
    expect(body).toContain(`<title>${category.name} — Electronics — Gyral Goods</title>`);
    expect(body).toContain('Showing 1–2 of 2 products');
    expect(body.match(/class="product-card"/g)).toHaveLength(2);
    expect(body).toMatch(
      new RegExp(`href="/c/electronics/${category.slug}"\\s*aria-current="page"`),
    );
    expect(body).not.toContain('aria-label="Pagination"'); // a single page has no pager
    expect(body).toContain(`"item":"http://localhost/c/electronics/${category.slug}"`);
  });

  it('paginates at 24 per page with self-canonical page URLs', async () => {
    const { db, get } = await testApp();
    const category = await firstCategory(db, 'electronics');
    await addProducts(db, category.id, 48); // 50 products → 3 pages
    const base = `/c/electronics/${category.slug}`;

    const second = text(await (await get(`${base}?page=2`)).text());
    expect(second).toContain('Showing 25–48 of 50 products');
    expect(second.match(/class="product-card"/g)).toHaveLength(24);
    expect(second).toContain(`<link rel="canonical" href="http://localhost${base}?page=2"`);
    expect(second).toContain(`(page 2) — Gyral Goods</title>`);
    expect(second).toContain(`href="${base}" rel="prev"`);
    expect(second).toContain(`href="${base}?page=3" rel="next"`);
    expect(second).toMatch(/aria-label="Page 2"\s*aria-current="page"/);

    const third = text(await (await get(`${base}?page=3`)).text());
    expect(third).toContain('Showing 49–50 of 50 products');
    expect(third).not.toContain('rel="next"');
  });

  it('redirects non-canonical page parameters and 404s past the last page', async () => {
    const { db, get } = await testApp();
    const category = await firstCategory(db, 'toys-games');
    const base = `/c/toys-games/${category.slug}`;
    for (const page of ['1', '0', 'abc']) {
      const res = await get(`${base}?page=${page}`);
      expect(res.status).toBe(301);
      expect(res.headers.get('location')).toBe(base);
    }
    expect((await get(`${base}?page=2`)).status).toBe(404);
  });

  it('404s for an unknown category or a category under the wrong department', async () => {
    const { db, get } = await testApp();
    const category = await firstCategory(db, 'electronics');
    expect((await get('/c/electronics/no-such-category')).status).toBe(404);
    expect((await get(`/c/books/${category.slug}`)).status).toBe(404);
  });

  it('produces the markup the browser test hydrates', async () => {
    // Golden file for test/browser/category.test.ts. Regenerate with `pnpm test -u`.
    const { db, html } = await testApp();
    const category = await firstCategory(db, 'electronics');
    await addProducts(db, category.id, 30);
    const page = await html(`/c/electronics/${category.slug}?page=2`);
    await expect(page).toMatchFileSnapshot('../fixtures/category.ssr.html');
  });
});

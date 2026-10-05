// The home page works with JavaScript disabled (docs/product-specs/quality.md, "No-JS").
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../support/app.js';
import { fixtureCategory } from '../support/listing.js';
import { closeBrowser, listen, openPage, type Served } from '../support/server.js';

let served: Served;
let listingPath: string;

beforeAll(async () => {
  const test = await testApp();
  listingPath = (await fixtureCategory(test.db)).path;
  served = await listen(test);
});

afterAll(async () => {
  await closeBrowser();
  await served.close();
});

describe('without JavaScript', () => {
  it('renders the header from Declarative Shadow DOM and the product grid', async () => {
    const page = await openPage({ javaScript: false });
    await page.goto(served.url('/'));
    await expect(page.title()).resolves.toBe('Gyral Goods');
    expect(
      await page.getByRole('navigation', { name: 'Departments' }).getByRole('link').count(),
    ).toBe(8);
    expect(await page.locator('.product-card').count()).toBeGreaterThan(8);
  });

  it('searches with a plain GET form', async () => {
    const page = await openPage({ javaScript: false });
    await page.goto(served.url('/'));
    await page.getByRole('searchbox', { name: 'Search products' }).first().fill('lamp');
    await page.getByRole('button', { name: 'Search' }).first().click();
    await page.waitForURL(/\/search\?q=lamp$/);
    expect(new URL(page.url()).pathname).toBe('/search');
  });

  it('filters and sorts a listing with the plain GET form', { timeout: 40_000 }, async () => {
    const page = await openPage({ javaScript: false });
    await page.goto(served.url(listingPath));
    const form = page.getByRole('form', { name: 'Filter and sort' });
    await form.getByLabel('On sale').check();
    await form.getByLabel('Sort by').selectOption('price-asc');
    await form.getByRole('button', { name: 'Apply' }).click();
    // The form submits every field; the server redirects to the one canonical spelling.
    await page.waitForURL((url) => url.search === '?sort=price-asc&sale=1');
    await expect(page.locator('.result-count').textContent()).resolves.toContain('of 3 products');
    const names = await page.locator('.product-card h3').allTextContents();
    expect(names.map((n) => n.trim())).toEqual(['Bravo', 'Delta', 'Golf']);
    expect(await form.getByLabel('On sale').isChecked()).toBe(true);
  });
});

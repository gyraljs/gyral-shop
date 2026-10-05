// Search works with JavaScript disabled (docs/product-specs/quality.md, "No-JS").
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../support/app.js';
import { closeBrowser, listen, openPage, type Served } from '../support/server.js';

let served: Served;

beforeAll(async () => {
  served = await listen(await testApp());
});

afterAll(async () => {
  await closeBrowser();
  await served.close();
});

describe('search without JavaScript', () => {
  it('searches from the header and refines results with the filter form', async () => {
    const page = await openPage({ javaScript: false });
    await page.goto(served.url('/'));
    await page.getByRole('searchbox', { name: 'Search products' }).first().fill('  smart  ');
    await page.getByRole('button', { name: 'Search' }).first().click();
    // The extra spaces are redirected away: one URL per search.
    await page.waitForURL(/\/search\?q=smart$/);
    await expect(page.title()).resolves.toBe('Results for “smart” — Gyral Goods');
    const before = await page.locator('shop-listing .product-card').count();
    expect(before).toBeGreaterThan(0);

    const form = page.getByRole('form', { name: 'Filter and sort' });
    await form.getByLabel('Sort by').selectOption('price-asc');
    await form.getByRole('button', { name: 'Apply' }).click();
    await page.waitForURL(/\/search\?q=smart&sort=price-asc$/);
    const prices = await page.locator('shop-listing .product-card .price').allTextContents();
    expect(prices.length).toBe(before);
  });

  it('shows suggestions when nothing matches', async () => {
    const page = await openPage({ javaScript: false });
    await page.goto(served.url('/search?q=xylophonequartz'));
    expect(await page.getByRole('heading', { name: 'Browse departments' }).count()).toBe(1);
    expect(await page.locator('.category-grid a').count()).toBe(8);
  });
});

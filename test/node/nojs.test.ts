// The home page works with JavaScript disabled (docs/product-specs/quality.md, "No-JS").
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
});

// SITE_ORIGIN: behind a proxy the request URL is internal, so absolute public URLs (canonical,
// sitemap, robots, structured data) must come from configuration (src/server/origin.ts).
import { beforeAll, describe, expect, it } from 'vitest';
import { testApp, type TestApp } from '../support/app.js';
import { firstCategory } from '../support/catalog.js';

const INTERNAL = 'http://10.0.0.7:8080';
const PUBLIC = 'https://shop.example';

let t: TestApp;
let fallback: TestApp;

beforeAll(async () => {
  t = await testApp({ siteOrigin: PUBLIC });
  fallback = await testApp();
});

const page = async (app: TestApp, path: string) => (await app.get(`${INTERNAL}${path}`)).text();

describe('SITE_ORIGIN', () => {
  it('builds canonical links and structured data from the configured origin', async () => {
    const home = await page(t, '/');
    expect(home).toContain(`<link rel="canonical" href="${PUBLIC}/"`);
    expect(home).toContain(`"url":"${PUBLIC}/"`);
    expect(home).not.toContain(INTERNAL);

    const category = await firstCategory(t.db, 'electronics');
    const listing = await page(t, `/c/electronics/${category.slug}`);
    expect(listing).toContain(
      `<link rel="canonical" href="${PUBLIC}/c/electronics/${category.slug}"`,
    );
    expect(listing).not.toContain(INTERNAL);
  });

  it('uses it in the sitemap and robots.txt', async () => {
    const sitemap = await page(t, '/sitemap.xml');
    expect(sitemap).toContain(`<loc>${PUBLIC}/</loc>`);
    expect(sitemap).not.toContain(INTERNAL);
    expect(await page(t, '/robots.txt')).toContain(`Sitemap: ${PUBLIC}/sitemap.xml`);
  });

  it("falls back to the request's origin when unset (local development)", async () => {
    expect(await page(fallback, '/robots.txt')).toContain(`Sitemap: ${INTERNAL}/sitemap.xml`);
  });
});

import { describe, expect, it } from 'vitest';
import { testApp } from '../support/app.js';

describe('pages', () => {
  it('server-renders the home page from the database', async () => {
    const { get } = await testApp();
    const res = await get('/');
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('<title>Gyral Goods</title>');
    expect(body).toContain('<shop-header');
    expect(body).toContain('shadowrootmode="open"');
    expect(body).toMatch(/href="\/d\/(<!--[^>]*-->)*toys-games"/);
    expect(body).toMatch(/Today(&#39;|')s deals/);
    expect(body).toMatch(/class="product-card"/);
    expect(body).toMatch(/<del>/); // sale prices
    expect(body).toContain('<script type="module" src="/src/client/entry.ts"></script>');
  });

  it('produces the markup the browser tests hydrate', async () => {
    // Golden file consumed by test/browser/home.test.ts. Regenerate with `pnpm test -u`.
    const { html } = await testApp();
    await expect(await html('/')).toMatchFileSnapshot('../fixtures/home.ssr.html');
  });

  it('answers unknown paths with a 404 page that is not indexed', async () => {
    const { get } = await testApp();
    const res = await get('/no/such/page');
    const body = await res.text();
    expect(res.status).toBe(404);
    expect(body).toContain('We couldn');
    expect(body).toContain('<meta name="robots" content="noindex"');
  });

  it('answers failures with a 500 page and no error details', async () => {
    const { app } = await testApp();
    app.get('/boom', () => {
      throw new Error('secret detail');
    });
    const original = console.error;
    console.error = () => undefined;
    const res = await app.request('/boom');
    console.error = original;
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(body).toContain('Something went wrong');
    expect(body).not.toContain('secret detail');
  });

  it('serves generated product images', async () => {
    const { get } = await testApp();
    const res = await get('/img/p/voltra-sleek-tv-1/2.svg');
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(await res.text()).toContain('<svg');
    expect((await get('/img/p/x/evil.png')).status).toBe(404);
  });
});

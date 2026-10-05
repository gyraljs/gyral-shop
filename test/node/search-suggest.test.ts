import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { SuggestionsSchema } from '../../src/ui/layout/suggestions.js';
import { testApp } from '../support/app.js';

describe('GET /api/search/suggest', () => {
  it('answers matching categories and products in the browser wire format', async () => {
    const test = await testApp();
    const response = await test.get('/api/search/suggest?q=kitch');
    expect(response.status).toBe(200);
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    expect(response.headers.get('cache-control')).toMatch(/max-age=60/);
    const body = v.parse(SuggestionsSchema, await response.json());
    expect(body.query).toBe('kitch');
    expect(body.categories.length + body.products.length).toBeGreaterThan(0);
    for (const c of body.categories) expect(c.name.toLowerCase()).toContain('kitch');
    for (const p of body.products) expect(p.href).toMatch(/^\/p\//);
    expect(body.products.length).toBeLessThanOrEqual(6);
    expect(body.categories.length).toBeLessThanOrEqual(3);
  });

  it('treats search syntax and markup as plain text, and empty queries as no suggestions', async () => {
    const test = await testApp();
    for (const q of ['', '   ', '"OR" NEAR(*', '<script>', '%_%']) {
      const response = await test.get(`/api/search/suggest?q=${encodeURIComponent(q)}`);
      expect(response.status, q).toBe(200);
      const body = v.parse(SuggestionsSchema, await response.json());
      if (!/[a-z]/i.test(q)) expect(body).toMatchObject({ products: [], categories: [] });
    }
  });

  it('server-renders the header search as a plain GET form with the current query', async () => {
    const test = await testApp();
    const html = await test.html('/search?q=kettle');
    expect(html).toMatch(/<shop-search[^>]*slot="search"/);
    expect(html).toMatch(/<form action="\/search" method="get" role="search"/);
    expect(html).toMatch(/<input[^>]*name="q"[^>]*value="kettle"/s);
    // Without JavaScript it is a plain search box: no combobox semantics, no suggestion list.
    const field = /<input[^>]*name="q"[^>]*>/s.exec(html)?.[0] ?? '';
    expect(field).not.toMatch(/role="combobox"|aria-expanded/);
    expect(html).not.toMatch(/id="search-suggestions"/);
  });
});

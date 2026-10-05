// ORDER IS LOAD-BEARING: hydrate support before anything that imports Lit (Gyral ADR 0012).
import '@gyral/ssr/hydrate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import baseJson from '../fixtures/listing-base.json?raw';
import serverHtml from '../fixtures/listing.ssr.html?raw';
import saleJson from '../fixtures/listing-sale.json?raw';
import { a11yViolations } from '../support/axe.js';
import { hydrated, mountSsrPage, type MountedPage } from '../support/page.js';

const { basePath } = JSON.parse(baseJson) as { basePath: string };
const errors = vi.spyOn(console, 'error');
const fetches: string[] = [];
let page: MountedPage;
let originalUrl: string;

const listing = () => {
  const el = page.root.querySelector('shop-listing');
  if (el === null || el.shadowRoot === null) throw new Error('no listing');
  return el.shadowRoot;
};
const count = () => listing().querySelector('.result-count')?.textContent.trim();
const saleBox = () => {
  const box = listing().querySelector('input[name="sale"]');
  if (!(box instanceof HTMLInputElement)) throw new Error('no sale checkbox');
  return box;
};

beforeAll(async () => {
  originalUrl = location.href;
  history.replaceState(null, '', basePath); // the page's own URL, as on a real page load
  vi.spyOn(window, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : String(input);
    fetches.push(url);
    const body = new URL(url).searchParams.get('sale') === '1' ? saleJson : baseJson;
    return Promise.resolve(new Response(body, { headers: { 'content-type': 'application/json' } }));
  });
  page = mountSsrPage(serverHtml);
  await import('../../src/client/entry.js');
  await hydrated(page.root);
});

afterAll(() => {
  page.unmount();
  history.replaceState(null, '', originalUrl);
});

describe('category listing with filters', () => {
  it('hydrates in place without fetching or errors', () => {
    expect(count()).toBe('Showing 1–8 of 8 products');
    expect(fetches).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
  });

  it('applies a filter without a page load, keeping the URL in sync', async () => {
    const marker = Symbol('same document');
    (window as unknown as Record<symbol, boolean>)[marker] = true;
    saleBox().click();
    // While the new results load, the control keeps the shopper's choice (no flicker back).
    await page.root.querySelector('shop-listing')?.updateComplete;
    expect(saleBox().checked).toBe(true);
    await vi.waitFor(() => {
      expect(count()).toBe('Showing 1–3 of 3 products');
    });
    expect(location.pathname + location.search).toBe(`${basePath}?sale=1`);
    expect(fetches.at(-1)).toContain(`/api/listing${basePath}?sale=1`);
    expect(saleBox().checked).toBe(true);
    expect(document.title).toContain('— Gyral Goods');
    expect((window as unknown as Record<symbol, boolean>)[marker]).toBe(true);
  });

  it('restores the previous results with the Back button', async () => {
    history.back();
    await vi.waitFor(() => {
      expect(count()).toBe('Showing 1–8 of 8 products');
    });
    expect(location.search).toBe('');
    expect(saleBox().checked).toBe(false);
    expect(errors).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    expect(await a11yViolations(page.root)).toEqual([]);
  });
});

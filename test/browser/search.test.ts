import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import baseJson from '../fixtures/search-base.json?raw';
import serverHtml from '../fixtures/search.ssr.html?raw';
import saleJson from '../fixtures/search-sale.json?raw';
import { a11yViolations } from '../support/axe.js';
import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';

const errors = vi.spyOn(console, 'error');
const fetches: string[] = [];
let page: MountedSsr;
let originalUrl: string;

const listing = () => {
  const el = page.root.querySelector('shop-listing');
  // Light DOM (Gyral ADR 0014): the listing's content is the element's own children.
  if (el === null) throw new Error('no listing');
  return el;
};
const count = () => listing().querySelector('.result-count')?.textContent.trim();
const saleBox = () => {
  const box = listing().querySelector('input[name="sale"]');
  if (!(box instanceof HTMLInputElement)) throw new Error('no sale checkbox');
  return box;
};

beforeAll(async () => {
  originalUrl = location.href;
  history.replaceState(null, '', '/search?q=quokka'); // the page's own URL
  vi.spyOn(window, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : String(input);
    fetches.push(url);
    const body = new URL(url).searchParams.get('sale') === '1' ? saleJson : baseJson;
    return Promise.resolve(new Response(body, { headers: { 'content-type': 'application/json' } }));
  });
  page = mountSsr(serverHtml);
  await import('../../src/client/entry.js');
  await hydrated(page);
});

afterAll(() => {
  page.unmount();
  history.replaceState(null, '', originalUrl);
});

describe('search results', () => {
  it('hydrates in place with the query and "Best match" sort, without fetching', () => {
    expect(count()).toBe('Showing 1–3 of 3 products');
    expect(listing().querySelector('h1')?.textContent).toContain('Results for “quokka”');
    expect(
      listing().querySelector('select[name="sort"] option[value="relevance"]')?.textContent.trim(),
    ).toBe('Best match');
    expect(fetches).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
  });

  it('filters within the results without a page load, keeping the query in the URL', async () => {
    saleBox().click();
    await vi.waitFor(() => {
      expect(count()).toBe('Showing 1–1 of 1 product');
    });
    expect(location.pathname + location.search).toBe('/search?q=quokka&sale=1');
    expect(fetches.at(-1)).toContain('/api/listing/search?q=quokka&sale=1');
    expect(document.title).toBe('Results for “quokka” — Gyral Goods');
  });

  it('restores the full results with the Back button', async () => {
    history.back();
    await vi.waitFor(() => {
      expect(count()).toBe('Showing 1–3 of 3 products');
    });
    expect(location.search).toBe('?q=quokka');
    expect(saleBox().checked).toBe(false);
    expect(errors).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    expect(await a11yViolations(page.root)).toEqual([]);
  });
});

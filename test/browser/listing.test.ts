import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import baseJson from '../fixtures/listing-base.json?raw';
import serverHtml from '../fixtures/listing.ssr.html?raw';
import saleJson from '../fixtures/listing-sale.json?raw';
import { a11yViolations } from '../support/axe.js';
import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';
import { settled } from '@gyral/core';

const { basePath } = JSON.parse(baseJson) as { basePath: string };
// A second page of the same listing, for the paging test.
const page2Json = JSON.stringify({
  ...(JSON.parse(baseJson) as { state: object }),
  state: { ...(JSON.parse(baseJson) as { state: object }).state, page: 2 },
  pageCount: 2,
});
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
  history.replaceState(null, '', basePath); // the page's own URL, as on a real page load
  vi.spyOn(window, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : String(input);
    fetches.push(url);
    const params = new URL(url).searchParams;
    const body =
      params.get('page') === '2' ? page2Json : params.get('sale') === '1' ? saleJson : baseJson;
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

describe('category listing with filters', () => {
  it('hydrates in place without fetching or errors', () => {
    expect(count()).toBe('Showing 1–8 of 8 products');
    expect(fetches).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
  });

  it('collapses the filters on a narrow listing and shows them expanded on a wide one', async () => {
    const panel = listing().querySelector('details.filters-panel');
    const summary = panel?.querySelector('summary');
    const firstField = panel?.querySelector('fieldset');
    if (!(panel instanceof HTMLDetailsElement) || !summary || !firstField)
      throw new Error('no panel');
    expect(panel.open).toBe(false); // no filters applied in the fixture
    const host = listing() as HTMLElement;
    try {
      host.style.inlineSize = '320px';
      await new Promise((r) => requestAnimationFrame(r));
      expect(summary.checkVisibility()).toBe(true);
      expect(firstField.checkVisibility()).toBe(false);
      host.style.inlineSize = '960px';
      await new Promise((r) => requestAnimationFrame(r));
      expect(summary.checkVisibility()).toBe(false); // no toggle on wide containers
      expect(firstField.checkVisibility()).toBe(true);
    } finally {
      host.style.inlineSize = '';
    }
  });

  it('applies a filter without a page load, keeping the URL in sync', async () => {
    const marker = Symbol('same document');
    (window as unknown as Record<symbol, boolean>)[marker] = true;
    saleBox().click();
    // While the new results load, the control keeps the shopper's choice (no flicker back).
    await settled();
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

  it('moves focus to the results heading after paging (focus command)', async () => {
    const el = listing();
    const current = el.state.view?.state;
    if (current === undefined) throw new Error('no listing state');
    el.send({ _tag: 'Go', state: { ...current, page: 2 } });
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(listing().querySelector('#listing-title'));
    });
    expect(location.search).toBe('?page=2');
  });

  it('has no axe violations', async () => {
    expect(await a11yViolations(page.root)).toEqual([]);
  });
});

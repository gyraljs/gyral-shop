// ORDER IS LOAD-BEARING: hydrate support before anything that imports Lit (Gyral ADR 0012).
import '@gyral/ssr/hydrate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import serverHtml from '../fixtures/product-reviews.ssr.html?raw';
import page2Json from '../fixtures/reviews-page2.json?raw';
import { a11yViolations } from '../support/axe.js';
import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';

// Fixture from test/node/reviews.test.ts: Grace (who bought the set) views the product page;
// Alan's review is the only one, so Grace may vote on it.
const errors = vi.spyOn(console, 'error');
const requests: { url: string; method: string; csrf: string | null }[] = [];
let page: MountedSsr;

const section = () => {
  const el = page.root.querySelector('shop-reviews');
  if (el === null) throw new Error('no reviews island');
  return el;
};
const firstArticle = () => section().querySelector('[data-component="review"]');

beforeAll(async () => {
  vi.spyOn(window, 'fetch').mockImplementation((input, init) => {
    const req = input instanceof Request ? input : new Request(String(input), init);
    requests.push({ url: req.url, method: req.method, csrf: req.headers.get('x-csrf-token') });
    const body = req.url.includes('/helpful') ? JSON.stringify({ helpfulCount: 1 }) : page2Json;
    return Promise.resolve(new Response(body, { headers: { 'content-type': 'application/json' } }));
  });
  page = mountSsr(serverHtml);
  await import('../../src/client/entry.js');
});

afterAll(() => {
  page.unmount();
});

describe('reviews island', () => {
  it('waits below the fold as server HTML, with working links and forms', () => {
    expect(section().hasAttribute('defer-hydration')).toBe(true);
    expect(section().querySelector('a[href="/p/lego/reviews?sort=newest"]')).not.toBeNull();
    expect(section().querySelector('form[action$="/helpful"]')).not.toBeNull();
  });

  it('hydrates in place once scrolled into view, without fetching', async () => {
    const before = firstArticle();
    section().scrollIntoView();
    await vi.waitFor(() => {
      expect(section().hasAttribute('defer-hydration')).toBe(false);
    });
    await hydrated(page);
    expect(firstArticle()).toBe(before);
    expect(requests).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
  });

  it('counts a helpful vote without a reload, sending the CSRF header', async () => {
    section().querySelector<HTMLButtonElement>('[data-component="review-helpful"] button')?.click();
    await vi.waitFor(() => {
      expect(section().querySelector('[data-component="review-helpful"]')?.textContent).toContain(
        'You found this helpful',
      );
    });
    const vote = requests.at(-1);
    expect(vote?.method).toBe('POST');
    expect(vote?.url).toMatch(/\/reviews\/\d+\/helpful$/);
    expect(vote?.csrf).toMatch(/.+/);
    expect(section().querySelector('[data-component="review-notice"]')?.textContent).toContain(
      'your vote was counted',
    );
  });

  it('sorts in place from the JSON endpoint and moves focus to the heading', async () => {
    section()
      .querySelector<HTMLAnchorElement>('[data-component="review-sort"] a[href*="newest"]')
      ?.click();
    await vi.waitFor(() => {
      expect(section().querySelector('[data-component="pager"]')?.textContent).toContain(
        'Page 2 of 2',
      );
    });
    expect(requests.at(-1)?.url).toContain('/api/reviews/lego?sort=newest');
    expect(location.pathname).not.toContain('/reviews'); // stayed on the product page
    expect(document.activeElement?.id).toBe('reviews-title');
  });

  it('has no accessibility violations', async () => {
    expect(await a11yViolations(page.root)).toEqual([]);
  });
});

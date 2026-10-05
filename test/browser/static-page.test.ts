// ORDER IS LOAD-BEARING: hydrate support before anything that imports Lit (Gyral ADR 0012).
import '@gyral/ssr/hydrate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import serverHtml from '../fixtures/static-about.ssr.html?raw';
import cartJson from '../fixtures/static-cart.json?raw';
import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';

// A prerendered page (fixture from test/node/static-pages.test.ts): the same HTML for every
// visitor. After hydration the header asks who is signed in and the mini-cart loads the cart.
const errors = vi.spyOn(console, 'error');
const requests: string[] = [];
let page: MountedSsr;

const header = () => {
  const el = page.root.querySelector('shop-header');
  if (el === null || el.shadowRoot === null) throw new Error('no header');
  return el.shadowRoot;
};
const badge = () =>
  page.root.querySelector('shop-mini-cart')?.shadowRoot?.querySelector('.badge')?.textContent;

beforeAll(async () => {
  vi.spyOn(window, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push(new URL(url, location.href).pathname); // the cart driver fetches a relative path
    const body = url.endsWith('/api/me')
      ? JSON.stringify({
          account: { firstName: 'Grace', csrfToken: 'token-from-api' },
          consentDecided: true,
        })
      : cartJson;
    return Promise.resolve(new Response(body, { headers: { 'content-type': 'application/json' } }));
  });
  page = mountSsr(serverHtml);
  expect(header().textContent).toContain('Sign in'); // static HTML: no one is signed in
  await import('../../src/client/entry.js');
  await hydrated(page);
});

afterAll(() => {
  page.unmount();
});

describe('a prerendered page', () => {
  it('shows the signed-in member and their cart after hydration', async () => {
    await vi.waitFor(
      () => {
        expect(header().querySelector('.account-menu summary')?.textContent).toContain('Hi, Grace');
        expect(badge()).toBe('2');
      },
      { timeout: 3000 },
    );
    // The header and the deferred consent banner both ask /api/me; Grace already chose.
    expect([...new Set(requests)].sort()).toEqual(['/api/cart', '/api/me']);
    expect(
      page.root.querySelector('shop-consent')?.querySelector('[data-region="consent"]'),
    ).toBeNull();
    // The sign-out form carries the token the API returned, not one baked into the page.
    expect(header().querySelector<HTMLInputElement>('input[name="_csrf"]')?.value).toBe(
      'token-from-api',
    );
    expect(errors).not.toHaveBeenCalled();
  });
});

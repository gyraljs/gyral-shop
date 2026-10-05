// ORDER IS LOAD-BEARING: hydrate support before anything that imports Lit (Gyral ADR 0012).
import '@gyral/ssr/hydrate';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import serverHtml from '../fixtures/static-about.ssr.html?raw';
import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';

// A prerendered page can't decide the consent banner: it starts closed and opens after
// hydration only when /api/me says this visitor hasn't chosen yet.
let page: MountedSsr;
const banner = () => page.root.querySelector('shop-consent [data-region="consent"]');

beforeAll(async () => {
  vi.spyOn(window, 'fetch').mockImplementation((input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const body =
      url.pathname === '/api/me' ? { account: null, consentDecided: false, analytics: false } : {};
    return Promise.resolve(Response.json(body));
  });
  page = mountSsr(serverHtml);
  await import('../../src/client/entry.js');
  await hydrated(page);
});

afterAll(() => {
  page.unmount();
});

it('opens the deferred banner for a visitor who has not chosen', async () => {
  await vi.waitFor(() => {
    expect(banner()).not.toBeNull();
  });
  expect(banner()?.textContent).toContain('Cookies on Gyral Goods');
});

// Adding from a product page with JavaScript: the buy box sends the shared cart store a
// message; the header badge and a status message update without navigating.
// ORDER IS LOAD-BEARING: hydrate support before anything that imports Lit (Gyral ADR 0012).
import '@gyral/ssr/hydrate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import serverHtml from '../fixtures/product.ssr.html?raw';
import { serverCart, stubCartApi } from '../support/cart-api.js';
import { hydrated, mountSsrPage, type MountedPage } from '../support/page.js';

let page: MountedPage;
let api: ReturnType<typeof stubCartApi>;

const shadowOf = (tag: string): ShadowRoot => {
  const found = page.root.querySelector(tag)?.shadowRoot;
  if (found == null) throw new Error(`no ${tag}`);
  return found;
};
const badge = () => shadowOf('shop-mini-cart').querySelector('.badge')?.textContent;
const buyBox = () => shadowOf('shop-buy-box');

beforeAll(() => {
  page = mountSsrPage(serverHtml);
  api = stubCartApi();
});

afterAll(() => {
  api.restore();
  page.unmount();
});

describe('add to cart with JavaScript', () => {
  it('updates the header badge and announces the add without leaving the page', async () => {
    await import('../../src/client/entry.js');
    await hydrated(page.root);
    expect(badge()).toBe('0');
    // Wait for the enhanced (per-option) form, then add the selected SKU.
    await vi.waitFor(() => {
      expect(buyBox().querySelector('input[type="hidden"][name="sku"]')).not.toBeNull();
    });
    const sku = buyBox().querySelector<HTMLInputElement>('input[type="hidden"][name="sku"]')?.value;
    const url = location.href;
    buyBox().querySelector<HTMLButtonElement>('form button[type="submit"]')?.click();

    await vi.waitFor(() => {
      expect(api.calls).toHaveLength(1);
    });
    const [call] = api.calls;
    expect([call?.method, call?.url, call?.body]).toEqual([
      'POST',
      '/api/cart/items',
      { sku, quantity: 1 },
    ]);
    expect(buyBox().querySelector('form button[type="submit"]')?.textContent.trim()).toBe(
      'Adding…',
    );
    call?.respond(200, {
      cart: serverCart([{ sku: sku ?? '', name: 'Earbuds', quantity: 1, unitCents: 4_999 }]),
      notice: 'Added 1 item of Earbuds to your cart.',
    });
    await vi.waitFor(() => {
      expect(badge()).toBe('1');
      expect(buyBox().querySelector('.added')?.textContent).toContain(
        'Added 1 item of Earbuds to your cart.',
      );
    });
    expect(location.href).toBe(url);
  });
});

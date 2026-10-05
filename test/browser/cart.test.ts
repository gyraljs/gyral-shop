// ORDER IS LOAD-BEARING: hydrate support before anything that imports Lit (Gyral ADR 0012).
import '@gyral/ssr/hydrate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import serverHtml from '../fixtures/cart.ssr.html?raw';
import { OFFLINE_MESSAGE } from '../../src/ui/cart/store.js';
import { a11yViolations } from '../support/axe.js';
import { serverCart, stubCartApi, type ApiCall } from '../support/cart-api.js';
import { hydrated, mountSsrPage, type MountedPage } from '../support/page.js';

const errors = vi.spyOn(console, 'error');
const warnings = vi.spyOn(console, 'warn');
let page: MountedPage;
let api: ReturnType<typeof stubCartApi>;

// The fixture's cart (test/node/cart-page.test.ts): TV 2 × $450 (list $500), LEGO 3 × $50.
const TV = { sku: 'TV-1', name: 'TV', unitCents: 45_000, listCents: 50_000 };
const LEGO = { sku: 'LEGO-1', name: 'LEGO', unitCents: 5_000 };

const shadowOf = (root: ParentNode, tag: string): ShadowRoot => {
  const found = root.querySelector(tag)?.shadowRoot;
  if (found == null) throw new Error(`no ${tag}`);
  return found;
};
const cartPage = () => shadowOf(page.root, 'shop-cart-page');
const badge = () => shadowOf(page.root, 'shop-mini-cart').querySelector('.badge')?.textContent;
const button = (label: string) => {
  const found = cartPage().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (found === null) throw new Error(`no button ${label}`);
  return found;
};
/** The quantity input of the line whose label names `name`. */
const quantityOf = (name: string) =>
  [...cartPage().querySelectorAll<HTMLInputElement>('input[name="quantity"][type="number"]')].find(
    (input) => cartPage().querySelector(`label[for="${input.id}"]`)?.textContent.includes(name),
  )?.value;
const status = () => cartPage().querySelector('[role="status"]');
const summary = () => cartPage().querySelector('.summary');
const lastCall = async (): Promise<ApiCall> => {
  await vi.waitFor(() => {
    expect(api.calls.length).toBeGreaterThan(0);
  });
  const call = api.calls.at(-1);
  if (call === undefined) throw new Error('no call');
  return call;
};

beforeAll(() => {
  page = mountSsrPage(serverHtml);
  api = stubCartApi();
});

afterAll(() => {
  api.restore();
  page.unmount();
});

describe('cart page', () => {
  it('paints the server cart before any component code loads', () => {
    expect(customElements.get('shop-cart-page')).toBeUndefined();
    expect(cartPage().querySelectorAll('.cart-line')).toHaveLength(2);
    expect(badge()).toBe('5');
  });

  it('hydrates in place from the seeded store, with no mismatch', async () => {
    const line = cartPage().querySelector('.cart-line');
    await import('../../src/client/entry.js');
    await hydrated(page.root);
    expect(cartPage().querySelector('.cart-line')).toBe(line);
    expect(badge()).toBe('5');
    expect(api.calls).toHaveLength(0);
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });

  it('changes a quantity at once, then reconciles with the server', async () => {
    button('Increase quantity of LEGO').click();
    await vi.waitFor(() => {
      expect(quantityOf('LEGO')).toBe('4');
      expect(badge()).toBe('6');
    });
    expect(summary()?.getAttribute('aria-busy')).toBe('true');
    const call = await lastCall();
    expect(call.method).toBe('PATCH');
    expect(call.url).toBe('/api/cart/items/LEGO-1');
    expect(call.body).toEqual({ quantity: 4 });
    expect(call.headers.get('x-csrf-token')).toBe('test-csrf-token');
    call.respond(200, {
      cart: serverCart([
        { ...TV, quantity: 2 },
        { ...LEGO, quantity: 4 },
      ]),
    });
    await vi.waitFor(() => {
      expect(summary()?.getAttribute('aria-busy')).toBe('false');
      expect(summary()?.textContent).toContain('$1,100.00');
    });
  });

  it('removes a line optimistically', async () => {
    button('Remove TV').click();
    await vi.waitFor(() => {
      expect(cartPage().querySelectorAll('.cart-line')).toHaveLength(1);
      expect(badge()).toBe('4');
    });
    const call = await lastCall();
    expect([call.method, call.url]).toEqual(['DELETE', '/api/cart/items/TV-1']);
    call.respond(200, { cart: serverCart([{ ...LEGO, quantity: 4 }]), notice: 'Removed TV.' });
    await vi.waitFor(() => {
      expect(status()?.textContent).toBe('Removed TV.');
    });
  });

  it('shows a rejected promo code in the status region', async () => {
    const input = cartPage().querySelector<HTMLInputElement>('#promo-code');
    if (input === null) throw new Error('no promo input');
    input.value = 'nope';
    cartPage().querySelector<HTMLButtonElement>('form.promo button')?.click();
    const call = await lastCall();
    expect([call.method, call.url, call.body]).toEqual([
      'POST',
      '/api/cart/promo',
      { code: 'nope' },
    ]);
    call.respond(422, {
      cart: serverCart([{ ...LEGO, quantity: 4 }]),
      error: { _tag: 'PromoRejected', message: 'We don’t recognise that promo code.' },
    });
    await vi.waitFor(() => {
      expect(status()?.textContent).toBe('We don’t recognise that promo code.');
      expect(status()?.classList.contains('error')).toBe(true);
    });
  });

  it('reports a network failure and re-reads the cart', async () => {
    const before = api.calls.length;
    button('Increase quantity of LEGO').click();
    (await lastCall()).fail();
    await vi.waitFor(() => {
      expect(status()?.textContent).toBe(OFFLINE_MESSAGE);
      expect(api.calls.length).toBe(before + 2);
    });
    const refresh = await lastCall();
    expect([refresh.method, refresh.url]).toEqual(['GET', '/api/cart']);
    refresh.respond(200, { cart: serverCart([{ ...LEGO, quantity: 4 }]) });
    await vi.waitFor(() => {
      expect(quantityOf('LEGO')).toBe('4');
      expect(badge()).toBe('4');
    });
  });

  it('has no axe violations', async () => {
    expect(await a11yViolations(page.root)).toEqual([]);
  });
});

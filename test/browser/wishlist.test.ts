// ORDER IS LOAD-BEARING: hydrate support before anything that imports Lit (Gyral ADR 0012).
import '@gyral/ssr/hydrate';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';
import productHtml from '../fixtures/wishlist-product.ssr.html?raw';
import wishlistHtml from '../fixtures/wishlist.ssr.html?raw';
import { FAILED_MESSAGE } from '../../src/ui/wishlist/store.js';
import { a11yViolations } from '../support/axe.js';
import { loadComponentsIn } from '../../src/client/lazy.js';
import { stubCartApi } from '../support/cart-api.js';

const errors = vi.spyOn(console, 'error');
let page: MountedSsr | undefined;

beforeAll(async () => {
  await import('../../src/client/entry.js');
});

afterEach(() => {
  page?.unmount();
  page = undefined;
  vi.restoreAllMocks();
});

async function productToggle() {
  page = mountSsr(productHtml);
  const button = () => {
    const b = page?.root.querySelector('.product-wish button');
    if (!(b instanceof HTMLButtonElement)) throw new Error('no wishlist toggle button');
    return b;
  };
  const before = button();
  await loadComponentsIn(page.root); // lazily split components (src/client/lazy.ts)
  await hydrated(page);
  const toggle = page.root.querySelector('.product-wish');
  if (toggle === null) throw new Error('no toggle');
  const slug = toggle.getAttribute('slug') ?? '';
  return { before, button, toggle, slug };
}

const settle = async (el: Element) => {
  await new Promise((r) => setTimeout(r, 0));
  await (el as unknown as { updateComplete: Promise<unknown> }).updateComplete;
};

describe('wishlist toggle on the product page', () => {
  it('hydrates in place without errors', async () => {
    const { before, button } = await productToggle();
    expect(button()).toBe(before);
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(errors).not.toHaveBeenCalled();
  });

  it('saves optimistically over JSON with the CSRF header, then confirms', async () => {
    const api = stubCartApi();
    const { button, toggle, slug } = await productToggle();
    button().click();
    await settle(toggle);
    expect(button().getAttribute('aria-pressed')).toBe('true'); // before the server answers
    const [call] = api.calls;
    expect(call?.method).toBe('POST');
    expect(call?.url).toBe('/api/wishlist/items');
    expect(call?.body).toEqual({ product: slug });
    expect(call?.headers.get('x-csrf-token')).toBe('test-csrf-token');
    call?.respond(200, { slugs: [slug], message: 'Saved it to your wishlist.' });
    await vi.waitFor(() => {
      expect(toggle.querySelector('[role="status"]')?.textContent).toContain('Saved it');
    });
    expect(button().getAttribute('aria-pressed')).toBe('true');
    api.restore();
  });

  it('undoes the change and says so when the request fails', async () => {
    const api = stubCartApi();
    const { button, toggle } = await productToggle();
    button().click();
    await settle(toggle);
    api.calls[0]?.fail();
    await vi.waitFor(() => {
      expect(button().getAttribute('aria-pressed')).toBe('false');
    });
    expect(toggle.querySelector('[role="status"]')?.textContent).toContain(FAILED_MESSAGE);
    api.restore();
  });
});

describe('wishlist page', () => {
  it('hydrates and has no axe violations', async () => {
    page = mountSsr(wishlistHtml);
    await loadComponentsIn(page.root); // lazily split components (src/client/lazy.ts)
    await hydrated(page);
    expect(page.root.querySelectorAll('[data-component="wishlist-item"]')).toHaveLength(2);
    expect(await a11yViolations(page.root)).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
  });
});

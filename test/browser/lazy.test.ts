import '@gyral/ssr/hydrate';
import { afterEach, describe, expect, it } from 'vitest';
import { LOADERS, loadComponentsIn, tagsIn } from '../../src/client/lazy.js';

afterEach(() => {
  document.body.replaceChildren();
});

describe('per-route code splitting (src/client/lazy.ts)', () => {
  it('finds custom element tags in light DOM and inside shadow roots', () => {
    const host = document.createElement('div');
    host.innerHTML = '<shop-listing></shop-listing><span></span>';
    const outer = document.createElement('x-outer');
    outer.attachShadow({ mode: 'open' }).innerHTML = '<shop-gallery></shop-gallery>';
    host.append(outer);
    expect([...tagsIn(host)].sort()).toEqual(['shop-gallery', 'shop-listing', 'x-outer']);
  });

  it('defines only the components present on the page', async () => {
    document.body.innerHTML = '<shop-contact-form></shop-contact-form>';
    await loadComponentsIn(document);
    expect(customElements.get('shop-contact-form')).toBeDefined();
    expect(customElements.get('shop-checkout')).toBeUndefined();
  });

  it('has a loader for every page-specific component tag', () => {
    expect(Object.keys(LOADERS)).toEqual(
      expect.arrayContaining(['shop-listing', 'shop-checkout', 'shop-cart-page', 'shop-admin']),
    );
  });
});

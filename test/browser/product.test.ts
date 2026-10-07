import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import serverHtml from '../fixtures/product.ssr.html?raw';
import { a11yViolations } from '../support/axe.js';
import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';

const errors = vi.spyOn(console, 'error');
const warnings = vi.spyOn(console, 'warn');
let page: MountedSsr;

const shadow = (tag: string): ShadowRoot => {
  const root = page.root.querySelector(tag)?.shadowRoot;
  if (root == null) throw new Error(`no ${tag}`);
  return root;
};
const buyBox = () => shadow('shop-buy-box');
const gallery = () => shadow('shop-gallery');
const all = <T extends Element>(root: ParentNode, selector: string) => [
  ...root.querySelectorAll<T>(selector),
];
const visibleViews = () =>
  all<HTMLElement>(gallery(), '.view').filter((v) => getComputedStyle(v).display !== 'none');
const skuValue = () =>
  buyBox().querySelector<HTMLInputElement>(
    'input[name="sku"]:checked, input[type="hidden"][name="sku"]',
  )?.value;

beforeAll(() => {
  page = mountSsr(serverHtml);
});

afterAll(() => {
  page.unmount();
});

describe('product page', () => {
  it('paints from server markup: one visible image and a no-JS SKU list', () => {
    expect(visibleViews()).toHaveLength(1);
    const skus = all<HTMLInputElement>(buyBox(), 'input[type="radio"][name="sku"]');
    expect(skus.length).toBeGreaterThan(1);
    expect(skus.filter((s) => s.disabled)).toHaveLength(1); // the sold-out SKU
    expect(buyBox().querySelector('form')?.getAttribute('action')).toBe('/cart/add');
  });

  it('hydrates in place, then switches to per-option choices', async () => {
    const form = buyBox().querySelector('form');
    await import('../../src/client/entry.js');
    await hydrated(page);
    await vi.waitFor(() => {
      expect(all(buyBox(), 'fieldset.axis').length).toBeGreaterThan(0);
    });
    expect(buyBox().querySelector('form')).toBe(form); // same DOM, not re-created
    expect(buyBox().querySelector('input[type="hidden"][name="sku"]')).not.toBeNull();
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });

  it('marks the sold-out combination unavailable with a reason', () => {
    const disabled = all<HTMLInputElement>(buyBox(), 'fieldset.axis input:disabled');
    expect(disabled.length).toBeGreaterThan(0);
    const [first] = disabled;
    const reason = first?.getAttribute('aria-describedby');
    expect(reason).toBeTruthy();
    expect(buyBox().getElementById(reason ?? '')?.textContent).toMatch(
      /Out of stock|Not available/,
    );
  });

  it('switches SKU, price and stock when an option changes', async () => {
    const before = skuValue();
    const choices = all<HTMLInputElement>(
      buyBox(),
      'fieldset.axis input:not(:checked):not(:disabled)',
    );
    const [next] = choices;
    if (next === undefined) throw new Error('no other available option');
    await userEvent.click(next);
    await vi.waitFor(() => {
      expect(skuValue()).not.toBe(before);
    });
    expect(next.checked).toBe(true);
    expect(buyBox().querySelector('[role="status"]')?.textContent).toMatch(/In stock|left/);
  });

  it('moves between images with the arrow keys', async () => {
    const [firstThumb] = all<HTMLInputElement>(gallery(), '.thumb input');
    firstThumb?.focus();
    await userEvent.keyboard('{ArrowRight}');
    const thumbs = all<HTMLInputElement>(gallery(), '.thumb input');
    expect(thumbs[1]?.checked).toBe(true);
    expect(visibleViews()).toEqual([all(gallery(), '.view')[1]]);
    await vi.waitFor(() => {
      expect(gallery().querySelector('.status')?.textContent).toMatch(/Image 2 of \d/);
    });
  });

  it('has no axe violations', async () => {
    expect(await a11yViolations(page.root)).toEqual([]);
  });
});

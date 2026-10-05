// ORDER IS LOAD-BEARING: hydrate support before anything that imports Lit (Gyral ADR 0012).
import '@gyral/ssr/hydrate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import serverHtml from '../fixtures/category.ssr.html?raw';
import { a11yViolations } from '../support/axe.js';
import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';

const errors = vi.spyOn(console, 'error');
const warnings = vi.spyOn(console, 'warn');
let page: MountedSsr;

const listing = () => {
  const el = page.root.querySelector('shop-listing');
  // Light DOM (Gyral ADR 0014): the listing's content is the element's own children.
  if (el === null) throw new Error('no listing');
  return el;
};

const header = () => {
  const el = page.root.querySelector('shop-header');
  if (el === null || el.shadowRoot === null) throw new Error('no header');
  return el;
};

beforeAll(() => {
  page = mountSsr(serverHtml);
});

afterAll(() => {
  page.unmount();
});

describe('category page (page 2 of a 32-product listing)', () => {
  it('paints the listing, pager and breadcrumbs from server markup', () => {
    expect(listing().querySelectorAll('.listing-results .product-card')).toHaveLength(8);
    expect(listing().querySelector('.result-count')?.textContent).toContain('25–32 of 32');
    const current = listing().querySelector('.pager [aria-current="page"]');
    expect(current?.textContent.trim()).toBe('2');
    expect(page.root.querySelector('.breadcrumbs [aria-current="page"]')).not.toBeNull();
  });

  it('hydrates the header in place and marks the department as current', async () => {
    const link = header().shadowRoot?.querySelector('nav.departments a[aria-current]');
    expect(link?.textContent.trim()).toBe('Electronics');
    await import('../../src/client/entry.js');
    await hydrated(page);
    expect(header().shadowRoot?.querySelector('nav.departments a[aria-current]')).toBe(link);
    const card = listing().querySelector('.product-card');
    await hydrated(page);
    expect(listing().querySelector('.product-card')).toBe(card); // hydrated in place
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    expect(await a11yViolations(page.root)).toEqual([]);
  });
});

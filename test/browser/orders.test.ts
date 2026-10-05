// ORDER IS LOAD-BEARING: hydrate support before anything that imports Lit (Gyral ADR 0012).
import '@gyral/ssr/hydrate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import detailHtml from '../fixtures/order-detail.ssr.html?raw';
import historyHtml from '../fixtures/order-history.ssr.html?raw';
import lookupHtml from '../fixtures/order-lookup.ssr.html?raw';
import { a11yViolations } from '../support/axe.js';
import { hydrated, mountSsrPage, type MountedPage } from '../support/page.js';

const errors = vi.spyOn(console, 'error');
let page: MountedPage | undefined;

afterEach(() => {
  page?.unmount();
  page = undefined;
});

const mount = async (html: string) => {
  page = mountSsrPage(html);
  await hydrated(page.root);
  return page.root;
};

describe('order pages (fixtures from test/node/orders.test.ts)', () => {
  it('history: a table of orders with theme hooks, accessible', async () => {
    const root = await mount(historyHtml);
    const table = root.querySelector('[data-region="order-history"] table');
    expect(table?.querySelector('caption')?.textContent).toContain('page 1 of 1');
    expect(root.querySelector('[data-component="order-number"]')?.textContent).toBe(
      'GG-20261004-TEST',
    );
    expect(root.querySelector('[data-component="order-status"]')?.getAttribute('data-status')).toBe(
      'paid',
    );
    expect(errors).not.toHaveBeenCalled();
    expect(await a11yViolations(root)).toEqual([]);
  });

  it('detail: timeline, totals and a cancel form behind a disclosure, accessible', async () => {
    const root = await mount(detailHtml);
    const events = root.querySelectorAll('[data-component="order-event"]');
    expect([...events].map((e) => e.getAttribute('data-status'))).toEqual([
      'pending_payment',
      'paid',
    ]);
    const details = root.querySelector('[data-region="order-cancel"] details');
    expect(details?.hasAttribute('open')).toBe(false);
    expect(root.querySelector('[data-component="cancel-form"] button')?.textContent).toContain(
      'GG-20261004-TEST',
    );
    expect(errors).not.toHaveBeenCalled();
    expect(await a11yViolations(root)).toEqual([]);
  });

  it('lookup: labelled fields with the number prefilled, accessible', async () => {
    const root = await mount(lookupHtml);
    const number = root.querySelector<HTMLInputElement>('#lookup-number');
    expect(number?.value).toBe('GG-20261004-TEST');
    expect(root.querySelector('label[for="lookup-email"]')?.textContent).toBe('Email');
    expect(errors).not.toHaveBeenCalled();
    expect(await a11yViolations(root)).toEqual([]);
  });
});

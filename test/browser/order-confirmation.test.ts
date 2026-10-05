// ORDER IS LOAD-BEARING: hydrate support before anything that imports Lit (Gyral ADR 0012).
import '@gyral/ssr/hydrate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import serverHtml from '../fixtures/order-confirmation.ssr.html?raw';
import { a11yViolations } from '../support/axe.js';
import { hydrated, mountSsrPage, type MountedPage } from '../support/page.js';

const errors = vi.spyOn(console, 'error');
let page: MountedPage;

beforeAll(() => {
  page = mountSsrPage(serverHtml);
});

afterAll(() => {
  page.unmount();
});

describe('order confirmation (fixture from test/node/place-order.test.ts)', () => {
  it('shows the order from server markup alone, with theme hooks', () => {
    const article = page.root.querySelector('[data-region="order-confirmation"]');
    expect(article?.querySelector('h1')?.textContent).toBe('Thank you, your order is placed');
    expect(article?.querySelector('[data-component="order-number"]')?.textContent).toBe(
      'GG-20261004-FXTURE',
    );
    expect(article?.querySelectorAll('[data-component="order-line"]')).toHaveLength(1);
    expect(article?.querySelector('.row.total dd')?.textContent).toBe('$104.00');
    expect(article?.querySelector('time')?.getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('hydrates the page shell without errors and has no axe violations', async () => {
    await hydrated(page.root);
    expect(errors).not.toHaveBeenCalled();
    expect(await a11yViolations(page.root)).toEqual([]);
  });
});

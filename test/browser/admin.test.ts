// The client-rendered admin: shell, navigation and dashboard (docs/product-specs/admin.md).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Dashboard } from '../../src/domain/admin.js';
import { a11yViolations } from '../support/axe.js';
import { fakeAdmin, mountAdmin, restoreAdmin } from '../support/admin-browser.js';

const dashboard: Dashboard = {
  asOf: '2026-10-04T12:00:00.000Z',
  sales: {
    today: { orders: 2, cents: 12_345 },
    week: { orders: 5, cents: 54_321 },
    month: { orders: 9, cents: 99_900 },
  },
  byStatus: [
    { status: 'paid', count: 4 },
    { status: 'cancelled', count: 1 },
  ],
  lowStock: [
    { variantId: 7, sku: 'TV-1', productId: 3, product: 'Big TV', label: 'Size: 55"', stock: 0 },
  ],
  topProducts: [{ productId: 4, name: 'Brick set', units: 6, cents: 30_000 }],
  pageViews: { week: 120, month: 480 },
  addToCart: { week: 9, month: 30 },
};

afterEach(() => {
  restoreAdmin();
});

const text = (el: Element) => el.textContent.replace(/\s+/g, ' ');

describe('<shop-admin>', () => {
  it('renders the dashboard from the API', async () => {
    const { http } = fakeAdmin('/admin', () => dashboard);
    const el = await mountAdmin('/admin');
    await vi.waitFor(() => {
      expect(el.querySelector('[data-region="admin-sales"]')).not.toBeNull();
    });
    expect(http.inputs.map((r) => r.url)).toEqual(['/api/admin/dashboard']);
    expect(text(el)).toContain('$123.45');
    expect(text(el)).toContain('2 orders');
    expect(text(el)).toContain('Paid 4');
    expect(el.querySelector('[data-stock="out"]')?.textContent.trim()).toBe('0');
    expect(el.querySelector('a[aria-current="page"]')?.textContent).toBe('Dashboard');
    expect(await a11yViolations(document.body)).toEqual([]);
  });

  it('navigates in-page between sections and moves focus to the new heading', async () => {
    const { router } = fakeAdmin('/admin', () => dashboard);
    const el = await mountAdmin('/admin');
    await vi.waitFor(() => {
      expect(el.querySelector('[data-region="admin-sales"]')).not.toBeNull();
    });
    el.querySelector<HTMLAnchorElement>('a[href="/admin/orders"]')?.click();
    await vi.waitFor(() => {
      expect(router.snapshot().href).toMatch(/\/admin\/orders$/);
      expect(el.querySelector('a[aria-current="page"]')?.textContent).toBe('Orders');
    });
    await vi.waitFor(() => {
      expect(document.activeElement?.tagName).toBe('H1');
    });
  });

  it('shows an error notice when the API fails', async () => {
    fakeAdmin('/admin', () => {
      throw new Error('boom');
    });
    const el = await mountAdmin('/admin');
    await vi.waitFor(() => {
      expect(el.querySelector('[role="alert"]')?.textContent).toMatch(/Something went wrong/);
    });
  });
});

// Admin products UI: table, sorting, search, editing with validation, stock adjustments.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductEdit, ProductList, Taxonomy } from '../../src/domain/admin.js';
import { a11yViolations } from '../support/axe.js';
import { fakeAdmin, mountAdmin, restoreAdmin, type FakeRequest } from '../support/admin-browser.js';

const taxonomy: Taxonomy = {
  departments: [{ id: 1, name: 'Toys & Games' }],
  categories: [{ id: 2, departmentId: 1, name: 'Building sets' }],
  brands: [{ id: 3, name: 'Acme' }],
};

const list: ProductList = {
  rows: [
    {
      id: 10,
      slug: 'brick-set',
      name: 'Brick set',
      brand: 'Acme',
      department: 'Toys & Games',
      category: 'Building sets',
      priceCents: 5000,
      salePriceCents: 4500,
      stock: 3,
      variants: 1,
      archived: false,
    },
  ],
  page: 1,
  pages: 3,
  total: 51,
};

const edit: ProductEdit = {
  product: {
    id: 10,
    slug: 'brick-set',
    name: 'Brick set',
    description: 'Lots of bricks.',
    departmentId: 1,
    categoryId: 2,
    brandId: 3,
    priceCents: 5000,
    salePriceCents: null,
    archived: false,
  },
  images: [{ url: '/img/b.svg', alt: 'Bricks' }],
  variants: [{ id: 77, sku: 'BRICK-1', options: {}, priceCents: null, stock: 3 }],
  log: [{ sku: 'BRICK-1', delta: 3, reason: 'Delivery', at: '2026-10-04T10:00:00.000Z' }],
  taxonomy,
};

function api(req: FakeRequest): unknown {
  const url = new URL(req.url, location.origin);
  if (url.pathname === '/api/admin/products' && req.method !== 'POST') return list;
  if (url.pathname === '/api/admin/products/10' && req.method !== 'POST') return edit;
  if (url.pathname === '/api/admin/variants/77/adjust') return { _tag: 'Adjusted', stock: 8 };
  if (url.pathname.startsWith('/api/admin/')) return { _tag: 'Saved', id: 10 };
  throw new Error(`unexpected request ${req.url}`);
}

afterEach(() => {
  restoreAdmin();
});

const field = (el: Element, selector: string) => {
  const found = el.querySelector(selector);
  if (!(found instanceof HTMLInputElement || found instanceof HTMLTextAreaElement)) {
    throw new Error(`no field ${selector}`);
  }
  return found;
};

describe('product list', () => {
  it('shows the table with sort state and pages, and sorts through the URL', async () => {
    const { router, http } = fakeAdmin('/admin/products', api);
    const el = await mountAdmin('/admin/products');
    await vi.waitFor(() => {
      expect(el.querySelector('[data-component="product-row"]')).not.toBeNull();
    });
    expect(el.querySelector('caption')?.textContent.trim()).toBe('51 products');
    expect(el.querySelector('th[aria-sort="ascending"]')?.textContent).toContain('Name');
    expect(el.querySelector('[data-component="pager"]')?.textContent).toMatch(/Page 1 of 3/);
    el.querySelector<HTMLButtonElement>('th button[value="price"]')?.click();
    await vi.waitFor(() => {
      expect(router.snapshot().href).toMatch(/\/admin\/products\?sort=price$/);
      expect(http.inputs.at(-1)?.url).toContain('sort=price');
    });
    expect(await a11yViolations(document.body)).toEqual([]);
  });

  it('searches through the URL', async () => {
    const { router } = fakeAdmin('/admin/products', api);
    const el = await mountAdmin('/admin/products');
    await vi.waitFor(() => {
      expect(el.querySelector('[data-component="product-row"]')).not.toBeNull();
    });
    field(el, 'input[name="q"]').value = 'brick';
    el.querySelector<HTMLFormElement>('form[data-component="product-search"]')?.requestSubmit();
    await vi.waitFor(() => {
      expect(router.snapshot().href).toMatch(/\/admin\/products\?q=brick$/);
    });
  });
});

describe('product editor', () => {
  it('validates in the browser before sending anything', async () => {
    const { http } = fakeAdmin('/admin/products/10', api);
    const el = await mountAdmin('/admin/products/10');
    await vi.waitFor(() => {
      expect(el.querySelector('form[data-component="product-form"]')).not.toBeNull();
    });
    field(el, '#product-price').value = 'free';
    el.querySelector<HTMLFormElement>('form[data-component="product-form"]')?.requestSubmit();
    await vi.waitFor(() => {
      expect(el.querySelector('#product-price-error')?.textContent).toMatch(/like 19\.99/);
    });
    expect(field(el, '#product-price').getAttribute('aria-invalid')).toBe('true');
    expect(http.inputs.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it('saves the product and adjusts stock with a reason', async () => {
    const { http } = fakeAdmin('/admin/products/10', api);
    const el = await mountAdmin('/admin/products/10');
    await vi.waitFor(() => {
      expect(el.querySelector('[data-component="variant"]')).not.toBeNull();
    });
    expect(field(el, '#product-name').value).toBe('Brick set');
    el.querySelector<HTMLFormElement>('form[data-component="product-form"]')?.requestSubmit();
    await vi.waitFor(() => {
      expect(el.querySelector('[role="status"][data-kind="success"]')?.textContent.trim()).toBe(
        'Product saved.',
      );
    });
    field(el, '#s77-delta').value = '5';
    field(el, '#s77-reason').value = 'Delivery';
    el.querySelector<HTMLFormElement>('form[data-component="stock-form"]')?.requestSubmit();
    await vi.waitFor(() => {
      expect(http.inputs.some((r) => r.url === '/api/admin/variants/77/adjust')).toBe(true);
    });
    const posted = http.inputs.find((r) => r.url === '/api/admin/variants/77/adjust')?.body;
    expect(posted instanceof FormData ? Object.fromEntries(posted) : posted).toMatchObject({
      delta: '5',
      reason: 'Delivery',
      variantId: '77',
    });
    expect(await a11yViolations(document.body)).toEqual([]);
  });

  it('starts a new product from the taxonomy', async () => {
    fakeAdmin('/admin/products/new', (req) =>
      req.url === '/api/admin/taxonomy' ? taxonomy : api(req),
    );
    const el = await mountAdmin('/admin/products/new');
    await vi.waitFor(() => {
      expect(el.querySelector('h1')?.textContent).toBe('New product');
      expect(el.querySelector('optgroup[label="Toys & Games"]')).not.toBeNull();
    });
    expect(el.querySelector('[data-component="variant"]')).toBeNull();
  });
});

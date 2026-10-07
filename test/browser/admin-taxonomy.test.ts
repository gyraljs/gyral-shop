// Admin departments, categories and brands UI (docs/product-specs/admin.md).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaxonomyAdmin } from '../../src/domain/admin-manage.js';
import { a11yViolations } from '../support/axe.js';
import { fakeAdmin, mountAdmin, restoreAdmin, type FakeRequest } from '../support/admin-browser.js';

const tree: TaxonomyAdmin = {
  departments: [
    {
      id: 1,
      slug: 'electronics',
      name: 'Electronics',
      archived: false,
      products: 12,
      categories: [
        { id: 4, slug: 'tvs', name: 'TVs', archived: false, products: 12 },
        { id: 5, slug: 'pagers', name: 'Pagers', archived: true, products: 0 },
      ],
    },
  ],
  brands: [{ id: 3, slug: 'acme', name: 'Acme', archived: false, products: 7 }],
};

function api(req: FakeRequest): unknown {
  if (req.url === '/api/admin/taxonomy/manage') return tree;
  if (req.method === 'POST') return { _tag: 'Saved', id: 1 };
  throw new Error(`unexpected request ${req.url}`);
}

const posted = (body: unknown) => (body instanceof FormData ? Object.fromEntries(body) : body);

afterEach(() => {
  restoreAdmin();
});

describe('departments and brands', () => {
  it('shows the tree with counts and archived entries', async () => {
    fakeAdmin('/admin/taxonomy', api);
    const el = await mountAdmin('/admin/taxonomy');
    await vi.waitFor(() => {
      expect(el.querySelectorAll('[data-component="taxon"]')).toHaveLength(4);
    });
    const pagers = el.querySelector(
      '[data-component="taxon"][data-kind="category"][data-archived="yes"]',
    );
    expect(pagers?.textContent).toContain('Archived');
    expect(pagers?.querySelector('[data-component="taxon-archive"] button')?.textContent).toContain(
      'Restore',
    );
    expect(await a11yViolations(document.body)).toEqual([]);
  });

  it('archives and renames through the API, then reloads', async () => {
    const { http } = fakeAdmin('/admin/taxonomy', api);
    const el = await mountAdmin('/admin/taxonomy');
    await vi.waitFor(() => {
      expect(el.querySelector('[data-component="taxon-archive"]')).not.toBeNull();
    });
    el.querySelector<HTMLFormElement>(
      '[data-kind="brand"] [data-component="taxon-archive"]',
    )?.requestSubmit();
    await vi.waitFor(() => {
      expect(http.inputs.some((r) => r.url === '/api/admin/taxonomy/brand/3/archive')).toBe(true);
    });
    const rename = el.querySelector<HTMLFormElement>(
      '[data-kind="department"] [data-component="taxon-rename"]',
    );
    const input = rename?.querySelector('input[name="name"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('no rename field');
    input.value = 'Electronics & Tech';
    rename?.requestSubmit();
    await vi.waitFor(() => {
      expect(el.querySelector('[role="status"][data-kind="success"]')?.textContent).toContain(
        'Renamed',
      );
    });
    expect(
      posted(http.inputs.find((r) => r.url === '/api/admin/taxonomy/department/1')?.body),
    ).toMatchObject({
      name: 'Electronics & Tech',
    });
    expect(
      http.inputs.filter((r) => r.url === '/api/admin/taxonomy/manage').length,
    ).toBeGreaterThan(1);
  });

  it('asks for a department before adding a category, without sending anything', async () => {
    const { http } = fakeAdmin('/admin/taxonomy', api);
    const el = await mountAdmin('/admin/taxonomy');
    const create = await vi.waitFor(() => {
      const found = el.querySelector<HTMLFormElement>('[data-component="taxon-create"]');
      if (found === null) throw new Error('no create form');
      return found;
    });
    const kind = create.querySelector('select[name="kind"]');
    const name = create.querySelector('input[name="name"]');
    if (!(kind instanceof HTMLSelectElement) || !(name instanceof HTMLInputElement))
      throw new Error('fields');
    kind.value = 'category';
    name.value = 'Drones';
    create.requestSubmit();
    await vi.waitFor(() => {
      expect(el.querySelector('#taxon-departmentId-error')?.textContent).toMatch(
        /Choose the department/,
      );
    });
    expect(http.inputs.filter((r) => r.method === 'POST')).toEqual([]);
    // The rejection changed no model value, so what the admin chose and typed stays.
    expect([kind.value, name.value]).toEqual(['category', 'Drones']);
  });

  it('starts the create form empty again after an addition', async () => {
    const { http } = fakeAdmin('/admin/taxonomy', api);
    const el = await mountAdmin('/admin/taxonomy');
    const createForm = () => {
      const found = el.querySelector<HTMLFormElement>('[data-component="taxon-create"]');
      if (found === null) throw new Error('no create form');
      return found;
    };
    const nameField = () => {
      const found = createForm().querySelector('input[name="name"]');
      if (!(found instanceof HTMLInputElement)) throw new Error('no name field');
      return found;
    };
    await vi.waitFor(() => createForm());
    nameField().value = 'Zenith';
    createForm().requestSubmit();
    await vi.waitFor(() => {
      expect(el.querySelector('[role="status"][data-kind="success"]')?.textContent).toContain(
        'Added.',
      );
    });
    expect(posted(http.inputs.find((r) => r.url === '/api/admin/taxonomy')?.body)).toMatchObject({
      kind: 'brand',
      name: 'Zenith',
    });
    expect(nameField().value).toBe('');
  });
});

// Admin departments, categories and brands (docs/product-specs/admin.md): create, rename,
// archive, restore, and what shoppers see afterwards.
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as v from 'valibot';
import { categories, departments, products } from '../../src/db/schema/catalog.js';
import { TaxonomyAdminSchema } from '../../src/domain/admin-manage.js';
import { TaxonomySchema } from '../../src/domain/admin.js';
import { testApp, type TestApp } from '../support/app.js';
import { getJson, signInAdmin } from '../support/admin.js';
import type { TestSession } from '../support/auth.js';
import { insertCartFixture, T0 } from '../support/cart-fixture.js';

let test: TestApp;
let admin: TestSession;

beforeEach(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  await insertCartFixture(test.db);
  admin = await signInAdmin(test);
});

const tree = async () =>
  v.parse(TaxonomyAdminSchema, (await getJson(admin, '/api/admin/taxonomy/manage')).body);

const idOf = async (slug: string) => {
  const [row] = await test.db.select().from(departments).where(eq(departments.slug, slug));
  return String(row?.id);
};

const categoryId = async (slug: string) => {
  const [row] = await test.db.select().from(categories).where(eq(categories.slug, slug));
  return String(row?.id);
};

const message = async (res: Response) =>
  ((await res.json()) as { issues: { message: string }[] }).issues[0]?.message;

describe('taxonomy admin', () => {
  it('lists everything with live product counts', async () => {
    const t = await tree();
    const electronics = t.departments.find((d) => d.slug === 'electronics');
    // The archived "old" product doesn't count.
    expect(electronics).toMatchObject({ products: 1, archived: false });
    expect(electronics?.categories.map((c) => [c.slug, c.products])).toEqual([
      ['old', 0],
      ['tv', 1],
    ]);
    expect(t.brands).toEqual([{ id: 1, slug: 'acme', name: 'Acme', archived: false, products: 3 }]);
  });

  it('creates departments, categories and brands, deriving the slug from the name', async () => {
    const dept = await admin.submitForm('/api/admin/taxonomy', {
      kind: 'department',
      name: 'Garden & Patio',
    });
    expect(dept.status).toBe(200);
    const garden = await idOf('garden-patio');
    expect(garden).not.toBe('undefined');
    const cat = await admin.submitForm('/api/admin/taxonomy', {
      kind: 'category',
      name: 'Planters',
      departmentId: garden,
    });
    expect(cat.status).toBe(200);
    expect(
      (await admin.submitForm('/api/admin/taxonomy', { kind: 'brand', name: 'Röd Elk', slug: '' }))
        .status,
    ).toBe(200);
    const t = await tree();
    expect(
      t.departments.find((d) => d.slug === 'garden-patio')?.categories.map((c) => c.slug),
    ).toEqual(['planters']);
    expect(t.brands.map((b) => b.slug)).toContain('rod-elk');
  });

  it('rejects duplicate slugs and categories without a usable department', async () => {
    const dup = await admin.submitForm('/api/admin/taxonomy', {
      kind: 'department',
      name: 'Electronics',
    });
    expect(dup.status).toBe(422);
    expect(await message(dup)).toMatch(/already uses the slug “electronics”/);
    const orphan = await admin.submitForm('/api/admin/taxonomy', { kind: 'category', name: 'X' });
    expect(orphan.status).toBe(422);
    const grocery = await idOf('grocery');
    await test.db.update(products).set({ archived: true }).where(eq(products.slug, 'apple'));
    expect(
      (
        await admin.submitForm(`/api/admin/taxonomy/department/${grocery}/archive`, {
          archived: 'yes',
        })
      ).status,
    ).toBe(200);
    const inArchived = await admin.submitForm('/api/admin/taxonomy', {
      kind: 'category',
      name: 'Snacks',
      departmentId: grocery,
    });
    expect(await message(inArchived)).toMatch(/Restore that department/);
  });

  it('refuses to archive while live products use it, and hides archived ones from shoppers', async () => {
    const electronics = await idOf('electronics');
    const blocked = await admin.submitForm(
      `/api/admin/taxonomy/department/${electronics}/archive`,
      { archived: 'yes' },
    );
    expect(blocked.status).toBe(422);
    expect(await message(blocked)).toBe('Archive or move its 1 live product first.');
    expect((await test.get('/d/electronics')).status).toBe(200);

    await test.db.update(products).set({ archived: true }).where(eq(products.slug, 'tv'));
    expect(
      (
        await admin.submitForm(`/api/admin/taxonomy/department/${electronics}/archive`, {
          archived: 'yes',
        })
      ).status,
    ).toBe(200);
    expect((await test.get('/d/electronics')).status).toBe(404);
    expect((await test.get('/c/electronics/tv')).status).toBe(404);
    const home = await (await test.get('/')).text();
    expect(home).not.toContain('href="/d/electronics"');
    expect(await (await test.get('/sitemap.xml')).text()).not.toContain('/d/electronics');
    // The product editor offers only live choices.
    const choices = v.parse(TaxonomySchema, (await getJson(admin, '/api/admin/taxonomy')).body);
    expect(choices.departments.map((d) => d.name)).not.toContain('Electronics');

    // A category can't be restored inside an archived department, nor a product in it.
    const tv = await categoryId('tv');
    await admin.submitForm(`/api/admin/taxonomy/category/${tv}/archive`, { archived: 'yes' });
    const restoreCategory = await admin.submitForm(`/api/admin/taxonomy/category/${tv}/archive`, {
      archived: 'no',
    });
    expect(await message(restoreCategory)).toBe('Restore its department first.');
    const [tvProduct] = await test.db.select().from(products).where(eq(products.slug, 'tv'));
    const restoreProduct = await admin.submitForm(
      `/api/admin/products/${String(tvProduct?.id)}/archive`,
      { archived: 'no' },
    );
    expect(restoreProduct.status).toBe(422);
    expect(await message(restoreProduct)).toMatch(/Restore its department and category first/);

    expect(
      (
        await admin.submitForm(`/api/admin/taxonomy/department/${electronics}/archive`, {
          archived: 'no',
        })
      ).status,
    ).toBe(200);
    expect((await test.get('/d/electronics')).status).toBe(200);
  });

  it('renames show up in the header navigation at once', async () => {
    await test.get('/'); // the header's departments are cached per app
    const toys = await idOf('toys-games');
    expect(
      (await admin.submitForm(`/api/admin/taxonomy/department/${toys}`, { name: 'Toys' })).status,
    ).toBe(200);
    const home = await (await test.get('/')).text();
    // The header's department links come from its hydration seed.
    expect(home).toContain(
      '&quot;slug&quot;:&quot;toys-games&quot;,&quot;name&quot;:&quot;Toys&quot;',
    );
  });
});

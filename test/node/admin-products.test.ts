// Admin products, variants and inventory API (docs/product-specs/admin.md).
import { beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import * as v from 'valibot';
import {
  brands,
  categories,
  departments,
  products,
  variants,
} from '../../src/db/schema/catalog.js';
import { inventoryLog } from '../../src/db/schema/commerce.js';
import { ProductEditSchema, ProductListSchema } from '../../src/domain/admin.js';
import { testApp, type TestApp } from '../support/app.js';
import { createMember, loginAs, type TestSession } from '../support/auth.js';
import { getJson, signInAdmin } from '../support/admin.js';
import { insertCartFixture, SKU, T0 } from '../support/cart-fixture.js';

let test: TestApp;
let admin: TestSession;

beforeEach(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  await insertCartFixture(test.db);
  admin = await signInAdmin(test);
});

async function ids() {
  const [toys] = await test.db.select().from(departments).where(eq(departments.slug, 'toys-games'));
  const [electronics] = await test.db
    .select()
    .from(departments)
    .where(eq(departments.slug, 'electronics'));
  const [toyCategory] = await test.db
    .select()
    .from(categories)
    .where(eq(categories.departmentId, toys?.id ?? 0));
  const [brand] = await test.db.select().from(brands);
  if (!toys || !electronics || !toyCategory || !brand) throw new Error('fixture taxonomy missing');
  return {
    toys: toys.id,
    electronics: electronics.id,
    toyCategory: toyCategory.id,
    brand: brand.id,
  };
}

async function productFields(over: Record<string, string> = {}) {
  const t = await ids();
  return {
    name: 'Robot kit',
    slug: 'robot-kit',
    description: 'Build a small robot.',
    departmentId: String(t.toys),
    categoryId: String(t.toyCategory),
    brandId: String(t.brand),
    price: '49.99',
    salePrice: '',
    images: '/img/robot.svg | Robot, assembled',
    ...over,
  };
}

const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as unknown });

async function create(over: Record<string, string> = {}): Promise<number> {
  const { status, body } = await json(
    await admin.submitForm('/api/admin/products', await productFields(over)),
  );
  expect(status).toBe(200);
  return (body as { id: number }).id;
}

const search = async (term: string) =>
  (
    await test.db.all<{ rowid: number }>(
      sql`select rowid from products_fts where products_fts match ${term}`,
    )
  ).map((r) => r.rowid);

describe('product list', () => {
  it('lists, searches by name or SKU, sorts and pages', async () => {
    const all = v.parse(ProductListSchema, (await getJson(admin, '/api/admin/products')).body);
    expect(all.total).toBe(3); // the archived product is hidden
    expect(all.rows.map((r) => r.name)).toEqual([...all.rows.map((r) => r.name)].sort());
    const bySku = v.parse(
      ProductListSchema,
      (await getJson(admin, '/api/admin/products?q=lego')).body,
    );
    expect(bySku.rows).toHaveLength(1);
    expect(bySku.rows[0]?.stock).toBe(20);
    const pricey = v.parse(
      ProductListSchema,
      (await getJson(admin, '/api/admin/products?sort=price&dir=desc')).body,
    );
    expect(pricey.rows[0]?.salePriceCents).toBe(45_000);
    const archived = v.parse(
      ProductListSchema,
      (await getJson(admin, '/api/admin/products?archived=yes')).body,
    );
    expect(archived.rows.map((r) => r.archived)).toEqual([true]);
    expect((await getJson(admin, '/api/admin/products?page=9')).status).toBe(404);
  });

  it('treats LIKE wildcards in the search as plain text', async () => {
    const res = v.parse(
      ProductListSchema,
      (await getJson(admin, '/api/admin/products?q=%25')).body,
    );
    expect(res.total).toBe(0);
  });

  it('is admin-only', async () => {
    await createMember(test, {
      name: 'C',
      email: 'c@example.com',
      password: 'correct-horse-battery-9',
    });
    const customer = await loginAs(test, 'c@example.com');
    expect((await getJson(customer, '/api/admin/products')).status).toBe(403);
    expect((await customer.submitForm('/api/admin/products', await productFields())).status).toBe(
      403,
    );
  });
});

describe('creating and editing products', () => {
  it('creates a product that search can find, then edits and archives it', async () => {
    const id = await create();
    const edit = v.parse(
      ProductEditSchema,
      (await getJson(admin, `/api/admin/products/${String(id)}`)).body,
    );
    expect(edit.product).toMatchObject({
      name: 'Robot kit',
      priceCents: 4999,
      salePriceCents: null,
    });
    expect(edit.images).toEqual([{ url: '/img/robot.svg', alt: 'Robot, assembled' }]);
    expect(await search('robot')).toEqual([id]);

    const updated = await admin.submitForm(
      `/api/admin/products/${String(id)}`,
      await productFields({ name: 'Rover kit', salePrice: '39.00', images: '' }),
    );
    expect(await json(updated)).toEqual({ status: 200, body: { _tag: 'Saved', id } });
    const [row] = await test.db.select().from(products).where(eq(products.id, id));
    expect(row).toMatchObject({ name: 'Rover kit', salePriceCents: 3900 });
    expect(await search('rover')).toEqual([id]);

    await admin.submitForm(`/api/admin/products/${String(id)}/archive`, { archived: 'yes' });
    const [archived] = await test.db.select().from(products).where(eq(products.id, id));
    expect(archived?.archived).toBe(true);
  });

  it('rejects invalid input with field issues, like the browser does', async () => {
    await create();
    const cases: [Record<string, string>, string][] = [
      [{ slug: 'robot-kit', name: 'Other' }, 'slug'], // taken
      [{ slug: 'Bad Slug' }, 'slug'],
      [{ price: 'free' }, 'price'],
      [{ price: '10', salePrice: '12' }, 'salePrice'],
      [{ images: 'javascript:alert(1)' }, 'images'],
    ];
    for (const [over, path] of cases) {
      const res = await json(
        await admin.submitForm('/api/admin/products', await productFields(over)),
      );
      expect(res.status, JSON.stringify(over)).toBe(422);
      expect(res.body, JSON.stringify(over)).toMatchObject({
        _tag: 'IntentRejected',
        intent: 'SaveProduct',
        issues: [expect.objectContaining({ path })],
      });
    }
    const t = await ids();
    const wrongDept = await json(
      await admin.submitForm(
        '/api/admin/products',
        await productFields({ slug: 'x', departmentId: String(t.electronics) }),
      ),
    );
    expect(wrongDept.body).toMatchObject({ issues: [{ path: 'categoryId' }] });
  });

  it('needs the CSRF token', async () => {
    const res = await test.get('/api/admin/products', {
      method: 'POST',
      headers: { cookie: admin.cookie, accept: 'application/json' },
      body: new URLSearchParams(await productFields()),
    });
    expect(res.status).toBe(403);
  });
});

describe('variants and inventory', () => {
  it('adds and edits variants; new variants start with no stock', async () => {
    const id = await create();
    const added = await admin.submitForm(`/api/admin/products/${String(id)}/variants`, {
      sku: 'robot-red',
      options: 'Color=Red',
      price: '',
    });
    expect(added.status).toBe(200);
    const [variant] = await test.db.select().from(variants).where(eq(variants.sku, 'ROBOT-RED'));
    expect(variant).toMatchObject({ stock: 0, options: { Color: 'Red' }, priceCents: null });
    const dup = await json(
      await admin.submitForm(`/api/admin/products/${String(id)}/variants`, {
        sku: SKU.lego,
        options: '',
      }),
    );
    expect(dup.body).toMatchObject({ intent: 'AddVariant', issues: [{ path: 'sku' }] });
    const edited = await admin.submitForm(`/api/admin/variants/${String(variant?.id)}`, {
      sku: 'ROBOT-RED',
      options: 'Color=Crimson',
      price: '54.00',
    });
    expect(edited.status).toBe(200);
    const [after] = await test.db.select().from(variants).where(eq(variants.sku, 'ROBOT-RED'));
    expect(after).toMatchObject({ options: { Color: 'Crimson' }, priceCents: 5400 });
  });

  it('adjusts stock with a logged reason and never below zero', async () => {
    const [lego] = await test.db.select().from(variants).where(eq(variants.sku, SKU.lego));
    const path = `/api/admin/variants/${String(lego?.id)}/adjust`;
    expect(await json(await admin.submitForm(path, { delta: '5', reason: 'Delivery' }))).toEqual({
      status: 200,
      body: { _tag: 'Adjusted', stock: 25 },
    });
    const tooMany = await json(await admin.submitForm(path, { delta: '-26', reason: 'Count' }));
    expect(tooMany.body).toMatchObject({ intent: 'Adjust', issues: [{ path: 'delta' }] });
    expect((await json(await admin.submitForm(path, { delta: '0', reason: 'x' }))).status).toBe(
      422,
    );
    const log = await test.db
      .select()
      .from(inventoryLog)
      .where(eq(inventoryLog.variantId, lego?.id ?? 0));
    expect(log.map((l) => [l.delta, l.reason])).toEqual([[5, 'Delivery']]);
    const edit = v.parse(
      ProductEditSchema,
      (await getJson(admin, `/api/admin/products/${String(lego?.productId)}`)).body,
    );
    expect(edit.log[0]).toMatchObject({ sku: SKU.lego, delta: 5, reason: 'Delivery' });
    expect(edit.variants[0]?.stock).toBe(25);
  });
});

describe('renaming taxonomy (shop-eyl)', () => {
  it('reindexes products when a brand, category or department is renamed', async () => {
    const id = await create();
    const t = await ids();
    for (const [kind, taxonId, name] of [
      ['brand', t.brand, 'Zentech'],
      ['category', t.toyCategory, 'Gizmos'],
      ['department', t.toys, 'Playroom'],
    ] as const) {
      const res = await admin.submitForm(`/api/admin/taxonomy/${kind}/${String(taxonId)}`, {
        name,
      });
      expect(res.status, kind).toBe(200);
      expect(await search(name.toLowerCase()), kind).toContain(id);
    }
    expect(await search('acme')).toEqual([]);
  });
});

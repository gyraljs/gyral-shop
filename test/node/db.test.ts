import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../src/db/client.js';
import { findDepartment, listDepartments, productCards } from '../../src/db/repos/catalog.js';
import {
  brands,
  categories,
  departments,
  productImages,
  products,
  variants,
} from '../../src/db/schema.js';

async function smallCatalog() {
  const db = await createTestDb();
  const [toys] = await db
    .insert(departments)
    .values([
      { slug: 'toys-games', name: 'Toys & Games', position: 2 },
      { slug: 'books', name: 'Books', position: 1 },
    ])
    .returning();
  if (toys === undefined) throw new Error('no department');
  const [puzzles] = await db
    .insert(categories)
    .values({ departmentId: toys.id, slug: 'puzzles', name: 'Puzzles' })
    .returning();
  const [acme] = await db.insert(brands).values({ slug: 'acme', name: 'Acme' }).returning();
  if (puzzles === undefined || acme === undefined) throw new Error('setup');
  const base = { departmentId: toys.id, categoryId: puzzles.id, brandId: acme.id, description: '' };
  const [a, b] = await db
    .insert(products)
    .values([
      { ...base, slug: 'a', name: 'Alpha', priceCents: 1000, ratingSum: 8, ratingCount: 2 },
      { ...base, slug: 'b', name: 'Beta', priceCents: 2000, salePriceCents: 1500 },
    ])
    .returning();
  if (a === undefined || b === undefined) throw new Error('setup');
  await db.insert(variants).values([
    { productId: a.id, sku: 'A-1', options: {}, stock: 3 },
    { productId: a.id, sku: 'A-2', options: {}, stock: 2 },
    { productId: b.id, sku: 'B-1', options: {}, stock: 0 },
  ]);
  await db.insert(productImages).values([
    { productId: a.id, url: '/img/a-2.svg', alt: 'second', position: 1 },
    { productId: a.id, url: '/img/a-1.svg', alt: 'first', position: 0 },
  ]);
  return { db, toys, puzzles };
}

describe('database', () => {
  it('migrates an in-memory database and lists departments in order', async () => {
    const { db } = await smallCatalog();
    expect((await listDepartments(db)).map((d) => d.slug)).toEqual(['books', 'toys-games']);
  });

  it('finds a department with its categories', async () => {
    const { db } = await smallCatalog();
    const found = await findDepartment(db, 'toys-games');
    expect(found?.categories.map((c) => c.slug)).toEqual(['puzzles']);
    expect(await findDepartment(db, 'nope')).toBeUndefined();
  });

  it('builds product cards with brand, first image, total stock and filters', async () => {
    const { db, puzzles } = await smallCatalog();
    const cards = await productCards(db, { categoryId: puzzles.id, order: 'rating', limit: 10 });
    expect(cards.map((c) => [c.slug, c.brand, c.imageUrl, c.stock])).toEqual([
      ['a', 'Acme', '/img/a-1.svg', 5],
      ['b', 'Acme', null, 0],
    ]);
    const sale = await productCards(db, { onSale: true, limit: 10 });
    expect(sale.map((c) => c.slug)).toEqual(['b']);
  });

  it('runs transactions against the in-memory database', async () => {
    const { db } = await smallCatalog();
    await db.transaction(async (tx) => {
      await tx.update(variants).set({ stock: 9 }).where(eq(variants.sku, 'B-1'));
    });
    const [row] = await db.select().from(variants).where(eq(variants.sku, 'B-1'));
    expect(row?.stock).toBe(9);
  });

  it('enforces foreign keys', async () => {
    const { db } = await smallCatalog();
    await expect(
      db.insert(variants).values({ productId: 999, sku: 'X', options: {}, stock: 1 }),
    ).rejects.toThrow();
  });
});

// A tiny, exact catalog for cart tests: known prices, stock and promo codes.
import type { Db } from '../../src/db/client.js';
import { users } from '../../src/db/schema/accounts.js';
import {
  brands,
  categories,
  departments,
  products,
  variants,
} from '../../src/db/schema/catalog.js';
import { promoCodes } from '../../src/db/schema/commerce.js';

export const SKU = {
  /** $500, on sale $450, stock 3. */
  tv: 'TV-1',
  /** $50, stock 20. */
  lego: 'LEGO-1',
  /** $2 grocery, stock 0. */
  apple: 'APPLE-1',
  /** Archived product, stock 5. */
  old: 'OLD-1',
} as const;

export const T0 = new Date('2026-10-04T12:00:00Z');

async function one<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  if (row === undefined) throw new Error('insert returned no row');
  return row;
}

export async function insertCartFixture(db: Db): Promise<{ readonly userId: number }> {
  const dept = async (slug: string, name: string) =>
    one(db.insert(departments).values({ slug, name }).returning({ id: departments.id }));
  const electronics = await dept('electronics', 'Electronics');
  const toys = await dept('toys-games', 'Toys & Games');
  const grocery = await dept('grocery', 'Grocery');
  const brand = await one(
    db.insert(brands).values({ slug: 'acme', name: 'Acme' }).returning({ id: brands.id }),
  );
  const category = async (departmentId: number, slug: string) =>
    one(
      db
        .insert(categories)
        .values({ departmentId, slug, name: slug })
        .returning({ id: categories.id }),
    );

  const product = async (
    slug: string,
    departmentId: number,
    price: number,
    sale: number | null,
    sku: string,
    stock: number,
    archived = false,
  ) => {
    const cat = await category(departmentId, slug);
    const p = await one(
      db
        .insert(products)
        .values({
          slug,
          name: slug.toUpperCase(),
          description: '',
          departmentId,
          categoryId: cat.id,
          brandId: brand.id,
          priceCents: price,
          salePriceCents: sale,
          archived,
        })
        .returning({ id: products.id }),
    );
    await db.insert(variants).values({ productId: p.id, sku, options: {}, stock });
  };
  await product('tv', electronics.id, 50000, 45000, SKU.tv, 3);
  await product('lego', toys.id, 5000, null, SKU.lego, 20);
  await product('apple', grocery.id, 200, null, SKU.apple, 0);
  await product('old', electronics.id, 1000, null, SKU.old, 5, true);

  await db.insert(promoCodes).values([
    { code: 'WELCOME10', kind: 'percent', amount: 1000 },
    { code: 'SAVE5', kind: 'fixed', amount: 500, minSubtotalCents: 10000 },
    { code: 'TOYS20', kind: 'percent', amount: 2000, departmentId: toys.id },
    { code: 'EXPIRED', kind: 'percent', amount: 1000, endsAt: new Date('2026-01-01') },
    { code: 'OFF', kind: 'percent', amount: 1000, active: false },
  ]);

  const user = await one(
    db
      .insert(users)
      .values({ email: 'ann@example.com', name: 'Ann', passwordHash: 'scrypt$x$y' })
      .returning({ id: users.id }),
  );
  return { userId: user.id };
}

// A small, fully specified category for listing filter tests: every product's price, sale
// price, brand, rating and stock is set explicitly, so filter and sort results are exact.
import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../../src/db/client.js';
import { brands, productImages, products, variants } from '../../src/db/schema.js';
import { addProducts, firstCategory } from './catalog.js';

export interface FixtureProduct {
  readonly name: string;
  readonly brand: 'acme' | 'zenith';
  readonly priceCents: number;
  readonly salePriceCents: number | null;
  /** Average rating; `null` for unrated. */
  readonly rating: number | null;
  readonly stock: number;
}

/** Eight products: two brands, a spread of prices, sales, ratings and stock. */
export const FIXTURE: readonly FixtureProduct[] = [
  { name: 'Alpha', brand: 'acme', priceCents: 1000, salePriceCents: null, rating: 4.5, stock: 5 },
  { name: 'Bravo', brand: 'acme', priceCents: 2500, salePriceCents: 1900, rating: 3.0, stock: 0 },
  {
    name: 'Charlie',
    brand: 'acme',
    priceCents: 4000,
    salePriceCents: null,
    rating: null,
    stock: 2,
  },
  { name: 'Delta', brand: 'zenith', priceCents: 5500, salePriceCents: 4500, rating: 5.0, stock: 1 },
  { name: 'Echo', brand: 'zenith', priceCents: 7000, salePriceCents: null, rating: 2.0, stock: 9 },
  {
    name: 'Foxtrot',
    brand: 'zenith',
    priceCents: 900,
    salePriceCents: null,
    rating: 4.0,
    stock: 0,
  },
  { name: 'Golf', brand: 'acme', priceCents: 12000, salePriceCents: 9900, rating: 3.5, stock: 4 },
  { name: 'Hotel', brand: 'zenith', priceCents: 3000, salePriceCents: null, rating: 1.0, stock: 3 },
];

/**
 * Replaces the products of the first category of `departmentSlug` with FIXTURE. Returns the
 * category's slug and the path of its listing.
 */
export async function fixtureCategory(db: Db, departmentSlug = 'electronics') {
  const category = await firstCategory(db, departmentSlug);
  const [acme] = await db
    .insert(brands)
    .values({ slug: 'acme', name: 'Acme' })
    .onConflictDoNothing()
    .returning({ id: brands.id });
  const [zenith] = await db
    .insert(brands)
    .values({ slug: 'zenith', name: 'Zenith' })
    .onConflictDoNothing()
    .returning({ id: brands.id });
  if (acme === undefined || zenith === undefined) throw new Error('fixture brands exist');

  // Archive what the seed put here, then add exactly the fixture products.
  await db.update(products).set({ archived: true }).where(eq(products.categoryId, category.id));
  await addProducts(db, category.id, FIXTURE.length);
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.categoryId, category.id))
    .orderBy(products.id);
  const added = rows.slice(-FIXTURE.length);
  await db.delete(productImages).where(
    inArray(
      productImages.productId,
      added.map((r) => r.id),
    ),
  );
  for (const [n, row] of added.entries()) {
    const p = FIXTURE[n];
    if (p === undefined) continue;
    await db
      .update(products)
      .set({
        archived: false,
        name: p.name,
        slug: `fixture-${p.name.toLowerCase()}`,
        brandId: p.brand === 'acme' ? acme.id : zenith.id,
        priceCents: p.priceCents,
        salePriceCents: p.salePriceCents,
        ratingSum: p.rating === null ? 0 : Math.round(p.rating * 2),
        ratingCount: p.rating === null ? 0 : 2,
        createdAt: new Date(Date.UTC(2026, 0, n + 1)),
      })
      .where(eq(products.id, row.id));
    await db.insert(variants).values({
      productId: row.id,
      sku: `FIX-${p.name.toUpperCase()}`,
      options: {},
      stock: p.stock,
    });
  }
  return { slug: category.slug, path: `/c/${departmentSlug}/${category.slug}` };
}

/** Fixture product names, in the order a listing shows them. */
export const names = (cards: readonly { readonly name: string }[]) => cards.map((c) => c.name);

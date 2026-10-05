// Wishlist rows (docs/product-specs/wishlist-reviews.md). Writes go through the write lock
// (src/db/tx.ts); a repeated add is a no-op thanks to the (user, product) primary key.
import { and, asc, count, desc, eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { products, variants } from '../schema/catalog.js';
import { wishlistItems } from '../schema/commerce.js';
import { lockedWrite } from '../tx.js';

export interface WishlistEntry {
  readonly productId: number;
  readonly slug: string;
}

/** A member's saved products, newest first, skipping archived products. */
export function wishlistEntries(db: Db, userId: number): Promise<WishlistEntry[]> {
  return db
    .select({ productId: wishlistItems.productId, slug: products.slug })
    .from(wishlistItems)
    .innerJoin(products, eq(products.id, wishlistItems.productId))
    .where(and(eq(wishlistItems.userId, userId), eq(products.archived, false)))
    .orderBy(desc(wishlistItems.createdAt), desc(wishlistItems.productId));
}

export async function wishlistCount(db: Db, userId: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, userId));
  return row?.n ?? 0;
}

/** The product behind a slug (archived products included, so callers can say why). */
export async function productBySlug(
  db: Db,
  slug: string,
): Promise<{ id: number; name: string; archived: boolean } | undefined> {
  const [row] = await db
    .select({ id: products.id, name: products.name, archived: products.archived })
    .from(products)
    .where(eq(products.slug, slug));
  return row;
}

/** A product's SKUs in display order, with stock. */
export function productSkus(db: Db, productId: number): Promise<{ sku: string; stock: number }[]> {
  return db
    .select({ sku: variants.sku, stock: variants.stock })
    .from(variants)
    .where(eq(variants.productId, productId))
    .orderBy(asc(variants.position), asc(variants.id));
}

export const addWishlistItem = (db: Db, userId: number, productId: number): Promise<unknown> =>
  lockedWrite(db, (w) =>
    w.insert(wishlistItems).values({ userId, productId }).onConflictDoNothing(),
  );

export const removeWishlistItem = (db: Db, userId: number, productId: number): Promise<unknown> =>
  lockedWrite(db, (w) =>
    w
      .delete(wishlistItems)
      .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.productId, productId))),
  );

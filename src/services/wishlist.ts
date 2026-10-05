// Wishlist use-cases (docs/product-specs/wishlist-reviews.md): members save products, see them
// at /account/wishlist and move them to the cart. Results are tagged unions (no Effect).
import type { Db } from '../db/client.js';
import { productCards } from '../db/repos/catalog.js';
import {
  addWishlistItem,
  productBySlug,
  productSkus,
  removeWishlistItem,
  wishlistCount,
  wishlistEntries,
} from '../db/repos/wishlist.js';
import { err, ok, type Result } from '../domain/result.js';
import { addToCart, cartErrorMessage } from './cart.js';
import { toCard, type Card } from './catalog.js';

/** Keeps the seeded wishlist store and the page small. */
export const WISHLIST_LIMIT = 200;

export type WishlistError =
  | { readonly _tag: 'UnknownProduct'; readonly slug: string }
  | { readonly _tag: 'Full' }
  | { readonly _tag: 'ChooseOptions'; readonly slug: string; readonly name: string }
  | { readonly _tag: 'OutOfStock'; readonly name: string }
  | { readonly _tag: 'CartRejected'; readonly message: string };

export interface WishlistNotice {
  readonly message: string;
}

export function wishlistErrorMessage(error: WishlistError): string {
  switch (error._tag) {
    case 'UnknownProduct':
      return "That product isn't available any more.";
    case 'Full':
      return `Your wishlist can hold ${String(WISHLIST_LIMIT)} items. Remove some to save more.`;
    case 'ChooseOptions':
      return `Choose options for ${error.name} to add it to your cart.`;
    case 'OutOfStock':
      return `${error.name} is out of stock right now.`;
    case 'CartRejected':
      return error.message;
  }
}

/** Slugs of the member's saved products (newest first), for the wishlist store. */
export async function wishlistSlugs(db: Db, userId: number): Promise<string[]> {
  return (await wishlistEntries(db, userId)).map((e) => e.slug);
}

export async function saveToWishlist(
  db: Db,
  userId: number,
  slug: string,
): Promise<Result<WishlistNotice, WishlistError>> {
  const product = await productBySlug(db, slug);
  if (product === undefined || product.archived) return err({ _tag: 'UnknownProduct', slug });
  if ((await wishlistCount(db, userId)) >= WISHLIST_LIMIT) return err({ _tag: 'Full' });
  await addWishlistItem(db, userId, product.id);
  return ok({ message: `Saved ${product.name} to your wishlist.` });
}

export async function removeFromWishlist(
  db: Db,
  userId: number,
  slug: string,
): Promise<Result<WishlistNotice, WishlistError>> {
  const product = await productBySlug(db, slug);
  if (product === undefined) return err({ _tag: 'UnknownProduct', slug });
  await removeWishlistItem(db, userId, product.id);
  return ok({ message: `Removed ${product.name} from your wishlist.` });
}

/** The wishlist page's cards, in saved order. */
export async function wishlistCards(db: Db, userId: number): Promise<Card[]> {
  const entries = await wishlistEntries(db, userId);
  if (entries.length === 0) return [];
  const rows = await productCards(db, {
    productIds: entries.map((e) => e.productId),
    limit: WISHLIST_LIMIT,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return entries.flatMap((e) => {
    const row = byId.get(e.productId);
    return row === undefined ? [] : [toCard(row)];
  });
}

/**
 * Moves a saved product to the cart. Only single-SKU products can move directly; products with
 * options send the shopper to the product page to choose them.
 */
export async function moveToCart(
  db: Db,
  userId: number,
  slug: string,
): Promise<Result<WishlistNotice, WishlistError>> {
  const product = await productBySlug(db, slug);
  if (product === undefined || product.archived) return err({ _tag: 'UnknownProduct', slug });
  const skus = await productSkus(db, product.id);
  const [only] = skus;
  if (skus.length > 1 || only === undefined) {
    return err({ _tag: 'ChooseOptions', slug, name: product.name });
  }
  if (only.stock <= 0) return err({ _tag: 'OutOfStock', name: product.name });
  const added = await addToCart(db, { kind: 'member', userId }, only.sku, 1);
  if (!added.ok) return err({ _tag: 'CartRejected', message: cartErrorMessage(added.error) });
  await removeWishlistItem(db, userId, product.id);
  return ok({ message: `Moved ${product.name} to your cart.` });
}

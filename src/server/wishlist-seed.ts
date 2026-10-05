// Seeds the wishlist store into every page (Gyral ADR 0013), like the cart (cart-seed.ts):
// product cards and the product page read it during the server render. One instance per
// request. Guests get an empty, non-member wishlist and never start a session here.
import type { Context } from 'hono';
import type { StoreInstance } from '@gyral/core';
import type { Db } from '../db/client.js';
import { wishlistSlugs } from '../services/wishlist.js';
import {
  seededWishlist,
  wishlistStore,
  type WishlistMsg,
  type WishlistState,
} from '../ui/wishlist/store.js';
import type { AppEnv } from './security/index.js';

export async function wishlistStoreFor(
  db: Db,
  c: Context<AppEnv>,
): Promise<StoreInstance<WishlistState, WishlistMsg>> {
  const user = c.get('user');
  const csrf = c.get('session')?.csrfToken ?? '';
  return wishlistStore.instance(
    user === undefined
      ? seededWishlist(false, [], '')
      : seededWishlist(true, await wishlistSlugs(db, user.id), csrf),
  );
}

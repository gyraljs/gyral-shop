// Checkout persistence (docs/product-specs/checkout.md). Rows only; services/checkout.ts owns
// the rules. A draft row belongs to a cart and is deleted with it.
import { eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { checkouts, type ShippingAddress } from '../schema.js';
import { lockedWrite } from '../tx.js';

export interface CheckoutRow {
  readonly email: string | null;
  readonly shippingAddress: ShippingAddress | null;
  readonly shippingMethod: string | null;
  readonly paymentRef: string | null;
  readonly cardBrand: string | null;
  readonly cardLast4: string | null;
  readonly cardExpMonth: number | null;
  readonly cardExpYear: number | null;
}

export type CheckoutPatch = Partial<CheckoutRow>;

export async function findCheckout(db: Db, cartId: number): Promise<CheckoutRow | undefined> {
  const [row] = await db
    .select({
      email: checkouts.email,
      shippingAddress: checkouts.shippingAddress,
      shippingMethod: checkouts.shippingMethod,
      paymentRef: checkouts.paymentRef,
      cardBrand: checkouts.cardBrand,
      cardLast4: checkouts.cardLast4,
      cardExpMonth: checkouts.cardExpMonth,
      cardExpYear: checkouts.cardExpYear,
    })
    .from(checkouts)
    .where(eq(checkouts.cartId, cartId));
  return row;
}

/** Creates the cart's draft or updates the given columns. */
export async function saveCheckout(
  db: Db,
  cartId: number,
  patch: CheckoutPatch,
  now: Date,
): Promise<void> {
  await lockedWrite(db, (w) =>
    w
      .insert(checkouts)
      .values({ cartId, ...patch, updatedAt: now })
      .onConflictDoUpdate({ target: checkouts.cartId, set: { ...patch, updatedAt: now } }),
  );
}

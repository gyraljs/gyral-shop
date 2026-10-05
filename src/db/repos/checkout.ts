// Checkout persistence (docs/product-specs/checkout.md). Rows only; services/checkout.ts owns
// the rules. A draft row belongs to a cart and is deleted with it.
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { addresses, checkouts, type ShippingAddress } from '../schema.js';

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
  await db
    .insert(checkouts)
    .values({ cartId, ...patch, updatedAt: now })
    .onConflictDoUpdate({ target: checkouts.cartId, set: { ...patch, updatedAt: now } });
}

export interface AddressRow extends ShippingAddress {
  readonly id: number;
  readonly isDefault: boolean;
}

/** A member's saved addresses, default first. */
export async function memberAddresses(db: Db, userId: number): Promise<AddressRow[]> {
  return db
    .select({
      id: addresses.id,
      name: addresses.name,
      line1: addresses.line1,
      line2: addresses.line2,
      city: addresses.city,
      state: addresses.state,
      postalCode: addresses.postalCode,
      phone: addresses.phone,
      isDefault: addresses.isDefault,
    })
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.isDefault), asc(addresses.id));
}

export async function findMemberAddress(
  db: Db,
  userId: number,
  id: number,
): Promise<AddressRow | undefined> {
  const [row] = (await memberAddresses(db, userId)).filter((a) => a.id === id);
  return row;
}

/** Saves a new address for a member; the first one becomes the default. */
export async function insertMemberAddress(
  db: Db,
  userId: number,
  address: ShippingAddress,
): Promise<void> {
  const existing = await db
    .select({ id: addresses.id })
    .from(addresses)
    .where(and(eq(addresses.userId, userId)));
  await db.insert(addresses).values({ userId, ...address, isDefault: existing.length === 0 });
}

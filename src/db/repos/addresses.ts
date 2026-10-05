// A member's address book (docs/product-specs/accounts.md). Every query is scoped by user id,
// so one member can never read or change another's addresses.
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import type { Db } from '../client.js';
import { addresses, type ShippingAddress } from '../schema.js';

export interface SavedAddress extends ShippingAddress {
  readonly id: number;
  readonly isDefault: boolean;
}

const columns = {
  id: addresses.id,
  name: addresses.name,
  line1: addresses.line1,
  line2: addresses.line2,
  city: addresses.city,
  state: addresses.state,
  postalCode: addresses.postalCode,
  phone: addresses.phone,
  isDefault: addresses.isDefault,
};

const owned = (userId: number, id: number) =>
  and(eq(addresses.userId, userId), eq(addresses.id, id));

/** Default first, then oldest first. */
export function listAddresses(db: Db, userId: number): Promise<SavedAddress[]> {
  return db
    .select(columns)
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.isDefault), asc(addresses.id));
}

export async function findAddress(
  db: Db,
  userId: number,
  id: number,
): Promise<SavedAddress | undefined> {
  const [row] = await db.select(columns).from(addresses).where(owned(userId, id));
  return row;
}

/** Adds an address; the first one, or one marked default, becomes the default. */
export async function addAddress(
  db: Db,
  userId: number,
  address: ShippingAddress,
  makeDefault: boolean,
): Promise<number> {
  return db.transaction(async (tx) => {
    const others = await tx
      .select({ id: addresses.id })
      .from(addresses)
      .where(eq(addresses.userId, userId));
    const isDefault = makeDefault || others.length === 0;
    if (isDefault) {
      await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
    }
    const [row] = await tx
      .insert(addresses)
      .values({ userId, ...address, isDefault })
      .returning({ id: addresses.id });
    if (row === undefined) throw new Error('addAddress: insert returned no row');
    return row.id;
  });
}

/** Updates an address the member owns; false when it isn't theirs (or doesn't exist). */
export async function updateAddress(
  db: Db,
  userId: number,
  id: number,
  address: ShippingAddress,
  makeDefault: boolean,
): Promise<boolean> {
  if ((await findAddress(db, userId, id)) === undefined) return false;
  await db.transaction(async (tx) => {
    await tx.update(addresses).set(address).where(owned(userId, id));
    if (makeDefault) {
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(and(eq(addresses.userId, userId), ne(addresses.id, id)));
      await tx.update(addresses).set({ isDefault: true }).where(owned(userId, id));
    }
  });
  return true;
}

export async function setDefaultAddress(db: Db, userId: number, id: number): Promise<boolean> {
  const address = await findAddress(db, userId, id);
  if (address === undefined) return false;
  return updateAddress(db, userId, id, address, true);
}

/** Deletes an address; if it was the default, the oldest remaining one takes over. */
export async function deleteAddress(db: Db, userId: number, id: number): Promise<boolean> {
  const address = await findAddress(db, userId, id);
  if (address === undefined) return false;
  await db.transaction(async (tx) => {
    await tx.delete(addresses).where(owned(userId, id));
    if (!address.isDefault) return;
    const [next] = await tx
      .select({ id: addresses.id })
      .from(addresses)
      .where(eq(addresses.userId, userId))
      .orderBy(asc(addresses.id))
      .limit(1);
    if (next !== undefined) {
      await tx.update(addresses).set({ isDefault: true }).where(owned(userId, next.id));
    }
  });
  return true;
}

// Admin user management queries (docs/product-specs/admin.md, "Users"). Role and account
// changes are conditional updates inside a transaction, so the "at least one active admin"
// rule holds even when two admins act at once.
import { and, count, desc, eq, ne, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client.js';
import { orders, users } from '../schema.js';
import type { Tx } from '../tx.js';

type Reader = Db | Tx;

/** `%`, `_` and `\` match literally in LIKE patterns (ESCAPE '\'). */
const likeText = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const where = (q: string): SQL | undefined =>
  q === ''
    ? undefined
    : or(
        sql`${users.email} like ${likeText(q.toLowerCase())} escape '\\'`,
        sql`lower(${users.name}) like ${likeText(q.toLowerCase())} escape '\\'`,
      );

export async function countUsers(db: Reader, q: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(users).where(where(q));
  return row?.n ?? 0;
}

const orderCount = sql<number>`(select count(*) from ${orders} where ${orders.userId} = ${users.id})`;

export function userRows(db: Reader, q: string, page: { limit: number; offset: number }) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      disabled: users.disabled,
      createdAt: users.createdAt,
      orders: orderCount,
    })
    .from(users)
    .where(where(q))
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(page.limit)
    .offset(page.offset);
}

export async function findUserRow(db: Reader, id: number) {
  const [row] = await db
    .select({ id: users.id, role: users.role, disabled: users.disabled })
    .from(users)
    .where(eq(users.id, id));
  return row;
}

/** Admins who can sign in, other than `except`. */
export async function otherActiveAdmins(db: Reader, except: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.disabled, false), ne(users.id, except)));
  return row?.n ?? 0;
}

export async function setUserState(
  tx: Tx,
  id: number,
  change: { readonly role?: 'customer' | 'admin'; readonly disabled?: boolean },
): Promise<{ readonly role: 'customer' | 'admin'; readonly disabled: boolean } | undefined> {
  const [row] = await tx
    .update(users)
    .set(change)
    .where(eq(users.id, id))
    .returning({ role: users.role, disabled: users.disabled });
  return row;
}

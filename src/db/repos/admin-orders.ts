// Admin order queries and status changes (docs/product-specs/admin.md, "Orders"). Every
// change is a conditional update on the status (and refunded amount) the admin saw, so two
// admins, or an admin and a customer cancelling, can't apply the same change twice.
import { and, count, desc, eq, gte, lt, or, sql, sum, type SQL } from 'drizzle-orm';
import type { Db } from '../client.js';
import { orderLines, orders } from '../schema.js';
import type { Tx } from '../tx.js';
import { addOrderEvent } from './order-history.js';
import type { OrderRow } from './orders.js';

type Reader = Db | Tx;
type Status = OrderRow['status'];

export interface AdminOrderQuery {
  readonly status: Status | undefined;
  readonly from: Date | undefined;
  /** Exclusive upper bound. */
  readonly to: Date | undefined;
  /** Order number or customer email, partial match. */
  readonly q: string;
}

const escapeLike = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function where(query: AdminOrderQuery): SQL | undefined {
  const conditions: (SQL | undefined)[] = [
    query.status === undefined
      ? sql`${orders.status} != 'pending_payment'`
      : eq(orders.status, query.status),
    query.from === undefined ? undefined : gte(orders.createdAt, query.from),
    query.to === undefined ? undefined : lt(orders.createdAt, query.to),
  ];
  if (query.q !== '') {
    const pattern = escapeLike(query.q);
    conditions.push(
      or(
        sql`${orders.number} like ${pattern} escape '\\'`,
        sql`${orders.email} like ${pattern} escape '\\'`,
      ),
    );
  }
  return and(...conditions);
}

export async function countAdminOrders(db: Reader, query: AdminOrderQuery): Promise<number> {
  const [row] = await db.select({ n: count() }).from(orders).where(where(query));
  return row?.n ?? 0;
}

export function adminOrderRows(
  db: Reader,
  query: AdminOrderQuery,
  page: { readonly limit: number; readonly offset: number },
) {
  return db
    .select({
      number: orders.number,
      status: orders.status,
      email: orders.email,
      address: orders.shippingAddress,
      placedAt: orders.createdAt,
      totalCents: orders.totalCents,
      refundedCents: orders.refundedCents,
      items: sum(orderLines.quantity).mapWith(Number),
    })
    .from(orders)
    .leftJoin(orderLines, eq(orderLines.orderId, orders.id))
    .where(where(query))
    .groupBy(orders.id)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(page.limit)
    .offset(page.offset);
}

/** `from` → `to` only if the order is still in `from`; records a timeline event. */
export async function claimStatus(
  tx: Tx,
  order: OrderRow,
  change: { readonly from: Status; readonly to: Status; readonly note: string },
  now: Date,
): Promise<boolean> {
  const claimed = await tx
    .update(orders)
    .set({ status: change.to, updatedAt: now })
    .where(and(eq(orders.id, order.id), eq(orders.status, change.from)))
    .returning({ id: orders.id });
  if (claimed.length === 0) return false;
  await addOrderEvent(tx, order.id, change.to, change.note, now);
  return true;
}

/**
 * Records a refund before the provider is asked for it: status and refunded amount move only
 * if nobody changed them since the admin looked. Undo with releaseRefund if the provider fails.
 */
export async function claimRefund(
  tx: Tx,
  order: OrderRow,
  next: { readonly status: Status; readonly refundedCents: number },
  now: Date,
): Promise<boolean> {
  const claimed = await tx
    .update(orders)
    .set({ status: next.status, refundedCents: next.refundedCents, updatedAt: now })
    .where(
      and(
        eq(orders.id, order.id),
        eq(orders.status, order.status),
        eq(orders.refundedCents, order.refundedCents),
      ),
    )
    .returning({ id: orders.id });
  return claimed.length > 0;
}

/** Puts back the status and amount claimRefund changed, after a failed provider refund. */
export async function releaseRefund(
  tx: Tx,
  order: OrderRow,
  claimed: { readonly status: Status; readonly refundedCents: number },
  note: string,
  now: Date,
): Promise<void> {
  await tx
    .update(orders)
    .set({ status: order.status, refundedCents: order.refundedCents, updatedAt: now })
    .where(
      and(
        eq(orders.id, order.id),
        eq(orders.status, claimed.status),
        eq(orders.refundedCents, claimed.refundedCents),
      ),
    );
  await addOrderEvent(tx, order.id, order.status, note, now);
}

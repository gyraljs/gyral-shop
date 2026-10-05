// Order history, guest lookup, status timeline and cancellation (docs/product-specs/orders.md).
// Cancelling is claimed with a conditional update (only from `paid`), so a concurrent
// fulfilment or a double click can't cancel twice or restock twice.
import { and, count, desc, eq, sql, sum } from 'drizzle-orm';
import type { Db } from '../client.js';
import { inventoryLog, orderEvents, orderLines, orders, payments, variants } from '../schema.js';
import type { Tx } from '../tx.js';
import type { OrderRow } from './orders.js';

type Reader = Db | Tx;

export interface OrderSummaryRow {
  readonly number: string;
  readonly status: OrderRow['status'];
  readonly placedAt: Date;
  readonly totalCents: number;
  readonly itemCount: number;
}

/** A member's orders, newest first. Orders still awaiting payment are not history yet. */
export async function memberOrderRows(
  db: Reader,
  userId: number,
  page: { readonly limit: number; readonly offset: number },
): Promise<readonly OrderSummaryRow[]> {
  const rows = await db
    .select({
      number: orders.number,
      status: orders.status,
      placedAt: orders.createdAt,
      totalCents: orders.totalCents,
      itemCount: sum(orderLines.quantity).mapWith(Number),
    })
    .from(orders)
    .leftJoin(orderLines, eq(orderLines.orderId, orders.id))
    .where(and(eq(orders.userId, userId), sql`${orders.status} != 'pending_payment'`))
    .groupBy(orders.id)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(page.limit)
    .offset(page.offset);
  return rows;
}

export async function countMemberOrders(db: Reader, userId: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(orders)
    .where(and(eq(orders.userId, userId), sql`${orders.status} != 'pending_payment'`));
  return row?.n ?? 0;
}

/** The order with this number and email (case-insensitive), for guest lookup. */
export async function findOrderByNumberAndEmail(
  db: Reader,
  number: string,
  email: string,
): Promise<OrderRow | undefined> {
  const [row] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.number, number),
        eq(sql`lower(${orders.email})`, email.trim().toLowerCase()),
        sql`${orders.status} != 'pending_payment'`,
      ),
    );
  return row;
}

export interface OrderEventRow {
  readonly status: OrderRow['status'];
  readonly note: string | null;
  readonly at: Date;
}

export async function orderEventsOf(
  db: Reader,
  orderId: number,
): Promise<readonly OrderEventRow[]> {
  return db
    .select({ status: orderEvents.status, note: orderEvents.note, at: orderEvents.createdAt })
    .from(orderEvents)
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(orderEvents.createdAt, orderEvents.id);
}

export async function addOrderEvent(
  tx: Tx,
  orderId: number,
  status: OrderRow['status'],
  note: string | null,
  now: Date,
): Promise<void> {
  await tx.insert(orderEvents).values({ orderId, status, note, createdAt: now });
}

/** The captured payment behind an order, for refunds. */
export async function paymentRefOf(db: Reader, orderId: number): Promise<string | undefined> {
  const [row] = await db
    .select({ ref: payments.providerRef })
    .from(payments)
    .where(eq(payments.orderId, orderId));
  return row?.ref;
}

/**
 * Claims the cancellation: `paid` → `cancelled` only if the order is still paid, then puts
 * its stock back and records the event. False when someone else changed the order first.
 */
export async function claimCancellation(tx: Tx, order: OrderRow, now: Date): Promise<boolean> {
  const claimed = await tx
    .update(orders)
    .set({ status: 'cancelled', updatedAt: now })
    .where(and(eq(orders.id, order.id), eq(orders.status, 'paid')))
    .returning({ id: orders.id });
  if (claimed.length === 0) return false;
  const lines = await tx
    .select({ variantId: orderLines.variantId, quantity: orderLines.quantity })
    .from(orderLines)
    .where(eq(orderLines.orderId, order.id));
  for (const line of lines) {
    await tx
      .update(variants)
      .set({ stock: sql`${variants.stock} + ${line.quantity}` })
      .where(eq(variants.id, line.variantId));
  }
  if (lines.length > 0) {
    await tx.insert(inventoryLog).values(
      lines.map((l) => ({
        variantId: l.variantId,
        delta: l.quantity,
        reason: `cancelled ${order.number}`,
        createdAt: now,
      })),
    );
  }
  await addOrderEvent(tx, order.id, 'cancelled', 'Cancelled at your request', now);
  return true;
}

/** Records a refund against the order (refunded_cents and a timeline entry). */
export async function recordRefund(
  tx: Tx,
  orderId: number,
  refundedCents: number,
  note: string,
  now: Date,
): Promise<void> {
  await tx.update(orders).set({ refundedCents, updatedAt: now }).where(eq(orders.id, orderId));
  const [row] = await tx
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId));
  if (row !== undefined) await addOrderEvent(tx, orderId, row.status, note, now);
}

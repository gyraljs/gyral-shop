// Orders persistence (docs/product-specs/checkout.md, orders.md). Reserving an order is one
// transaction: conditional stock decrements (never below zero, even when two orders race),
// the promo's usage count (never past its limit), the order and its line snapshots. Releasing
// undoes all of it when the payment fails, so nothing is left half done.
import { and, asc, eq, gte, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import {
  carts,
  inventoryLog,
  orderEvents,
  orderLines,
  orders,
  payments,
  promoCodes,
  variants,
  type ShippingAddress,
} from '../schema.js';
import type { Tx } from '../tx.js';

export type OrderRow = typeof orders.$inferSelect;
export type OrderLineRow = typeof orderLines.$inferSelect;

export interface NewOrderLine {
  readonly variantId: number;
  readonly productName: string;
  readonly variantLabel: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
  readonly lineTotalCents: number;
}

export interface NewOrder {
  readonly number: string;
  readonly idempotencyKey: string;
  readonly userId: number | null;
  readonly email: string;
  readonly shippingAddress: ShippingAddress;
  readonly shippingMethod: string;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly shippingCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
  readonly promoCode: string | null;
  readonly lines: readonly NewOrderLine[];
}

export type ReserveFailure =
  | {
      readonly _tag: 'OutOfStock';
      readonly shortages: readonly { readonly variantId: number; readonly available: number }[];
    }
  | { readonly _tag: 'PromoExhausted'; readonly code: string };

/** Thrown inside the transaction so it rolls back; callers catch it by `instanceof`. */
export class ReservationRejected extends Error {
  constructor(readonly failure: ReserveFailure) {
    super(failure._tag);
  }
}

type Reader = Db | Tx;

export async function findOrderByKey(db: Reader, key: string): Promise<OrderRow | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.idempotencyKey, key));
  return row;
}

export async function findOrderByNumber(db: Reader, number: string): Promise<OrderRow | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.number, number));
  return row;
}

export async function orderLinesOf(db: Reader, orderId: number): Promise<OrderLineRow[]> {
  return db
    .select()
    .from(orderLines)
    .where(eq(orderLines.orderId, orderId))
    .orderBy(asc(orderLines.id));
}

export async function paymentOf(db: Reader, orderId: number) {
  const [row] = await db
    .select({ brand: payments.brand, last4: payments.last4 })
    .from(payments)
    .where(eq(payments.orderId, orderId));
  return row;
}

/** Reserves stock and promo usage and records the order as `pending_payment`. */
export async function reserveOrder(tx: Tx, order: NewOrder, now: Date): Promise<OrderRow> {
  const shortages: { variantId: number; available: number }[] = [];
  for (const line of order.lines) {
    const updated = await tx
      .update(variants)
      .set({ stock: sql`${variants.stock} - ${line.quantity}` })
      .where(and(eq(variants.id, line.variantId), gte(variants.stock, line.quantity)));
    if (updated.rowsAffected === 0) {
      const [row] = await tx
        .select({ stock: variants.stock })
        .from(variants)
        .where(eq(variants.id, line.variantId));
      shortages.push({ variantId: line.variantId, available: Math.max(0, row?.stock ?? 0) });
    }
  }
  if (shortages.length > 0) throw new ReservationRejected({ _tag: 'OutOfStock', shortages });

  if (order.promoCode !== null) {
    const used = await tx
      .update(promoCodes)
      .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
      .where(
        and(
          eq(promoCodes.code, order.promoCode),
          or(isNull(promoCodes.usageLimit), lt(promoCodes.usedCount, promoCodes.usageLimit)),
        ),
      );
    if (used.rowsAffected === 0) {
      throw new ReservationRejected({ _tag: 'PromoExhausted', code: order.promoCode });
    }
  }

  const { lines, ...columns } = order;
  const [row] = await tx
    .insert(orders)
    .values({ ...columns, status: 'pending_payment', createdAt: now, updatedAt: now })
    .returning();
  if (row === undefined) throw new Error('orders insert returned no row');
  await tx.insert(orderLines).values(lines.map((l) => ({ ...l, orderId: row.id })));
  await tx.insert(inventoryLog).values(
    lines.map((l) => ({
      variantId: l.variantId,
      delta: -l.quantity,
      reason: `order ${order.number}`,
      createdAt: now,
    })),
  );
  return row;
}

/** Undoes reserveOrder for an order whose payment failed: stock, promo usage, the order. */
export async function releaseOrder(tx: Tx, order: OrderRow, now: Date): Promise<void> {
  const lines = await orderLinesOf(tx, order.id);
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
        reason: `released ${order.number} (payment failed)`,
        createdAt: now,
      })),
    );
  }
  if (order.promoCode !== null) {
    await tx
      .update(promoCodes)
      .set({ usedCount: sql`max(${promoCodes.usedCount} - 1, 0)` })
      .where(eq(promoCodes.code, order.promoCode));
  }
  await tx.delete(orderLines).where(eq(orderLines.orderId, order.id));
  await tx.delete(orders).where(eq(orders.id, order.id));
}

/** The payment succeeded: the order is paid, the payment points at it, the cart is gone. */
export async function completeOrder(
  tx: Tx,
  input: {
    readonly orderId: number;
    readonly status: OrderRow['status'];
    readonly paymentRef: string;
    readonly cartId: number;
  },
  now: Date,
): Promise<void> {
  await tx
    .update(orders)
    .set({ status: input.status, updatedAt: now })
    .where(eq(orders.id, input.orderId));
  await tx.insert(orderEvents).values([
    { orderId: input.orderId, status: 'pending_payment', note: 'Order placed', createdAt: now },
    ...(input.status === 'paid'
      ? [
          {
            orderId: input.orderId,
            status: 'paid' as const,
            note: 'Payment received',
            createdAt: now,
          },
        ]
      : []),
  ]);
  await tx
    .update(payments)
    .set({ orderId: input.orderId })
    .where(eq(payments.providerRef, input.paymentRef));
  // Lines and the checkout draft go with the cart (ON DELETE CASCADE).
  await tx.delete(carts).where(eq(carts.id, input.cartId));
}

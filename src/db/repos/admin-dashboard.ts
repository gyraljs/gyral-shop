// Read-only queries behind the admin dashboard (docs/product-specs/admin.md, "Dashboard").
// Sales count money actually kept: order totals minus refunds, for orders that were paid.
import { and, asc, count, desc, eq, gte, inArray, lte, sql, sum } from 'drizzle-orm';
import type { Db } from '../client.js';
import { analyticsEvents, orderLines, orders, products, variants } from '../schema.js';
import type { OrderRow } from './orders.js';

/** Statuses whose orders count as sales (paid at some point and not cancelled). */
export const SALE_STATUSES = ['paid', 'fulfilled', 'delivered', 'partially_refunded'] as const;

export interface SalesRow {
  readonly orders: number;
  readonly cents: number;
}

export async function salesSince(db: Db, since: Date): Promise<SalesRow> {
  const [row] = await db
    .select({
      orders: count(),
      cents: sum(sql`${orders.totalCents} - ${orders.refundedCents}`).mapWith(Number),
    })
    .from(orders)
    .where(and(inArray(orders.status, [...SALE_STATUSES]), gte(orders.createdAt, since)));
  return { orders: row?.orders ?? 0, cents: row?.cents ?? 0 };
}

export interface StatusCountRow {
  readonly status: OrderRow['status'];
  readonly count: number;
}

/** Every order status with at least one order, excluding abandoned payments. */
export function ordersByStatus(db: Db): Promise<StatusCountRow[]> {
  return db
    .select({ status: orders.status, count: count() })
    .from(orders)
    .where(sql`${orders.status} != 'pending_payment'`)
    .groupBy(orders.status)
    .orderBy(desc(count()));
}

export interface LowStockRow {
  readonly variantId: number;
  readonly sku: string;
  readonly productId: number;
  readonly product: string;
  readonly options: Readonly<Record<string, string>>;
  readonly stock: number;
}

/** Live SKUs at or below `threshold` units, emptiest first. */
export function lowStock(db: Db, threshold: number, limit: number): Promise<LowStockRow[]> {
  return db
    .select({
      variantId: variants.id,
      sku: variants.sku,
      productId: products.id,
      product: products.name,
      options: variants.options,
      stock: variants.stock,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(eq(products.archived, false), lte(variants.stock, threshold)))
    .orderBy(asc(variants.stock), asc(variants.sku))
    .limit(limit);
}

export interface TopProductRow {
  readonly productId: number;
  readonly name: string;
  readonly units: number;
  readonly cents: number;
}

/** Best sellers by units in sold orders since `since`. */
export function topProducts(db: Db, since: Date, limit: number): Promise<TopProductRow[]> {
  return db
    .select({
      productId: products.id,
      name: products.name,
      units: sum(orderLines.quantity).mapWith(Number),
      cents: sum(orderLines.lineTotalCents).mapWith(Number),
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .innerJoin(variants, eq(variants.id, orderLines.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(inArray(orders.status, [...SALE_STATUSES]), gte(orders.createdAt, since)))
    .groupBy(products.id)
    .orderBy(desc(sum(orderLines.quantity)), asc(products.name))
    .limit(limit);
}

/** Consented analytics events of one kind since `since` (docs/product-specs/consent.md). */
export async function eventCount(db: Db, kind: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.kind, kind), gte(analyticsEvents.createdAt, since)));
  return row?.n ?? 0;
}

// What the order confirmation page shows (docs/product-specs/orders.md): the order as charged,
// from the order's own snapshots, never from today's catalog prices.
import { findOrderByNumber, orderLinesOf, paymentOf, type OrderRow } from '../db/repos/orders.js';
import type { Db } from '../db/client.js';
import { isShippingMethod, estimatedDelivery, shippingOptions } from '../domain/shipping.js';
import { usd, type Money } from '../domain/money.js';

export interface OrderView {
  readonly id: number;
  readonly number: string;
  readonly userId: number | null;
  readonly email: string;
  readonly status: OrderRow['status'];
  readonly placedAt: Date;
  readonly lines: readonly {
    readonly name: string;
    readonly variant: string;
    readonly quantity: number;
    readonly unit: Money;
    readonly lineTotal: Money;
  }[];
  readonly totals: {
    readonly subtotal: Money;
    readonly discount: Money;
    readonly shipping: Money;
    readonly tax: Money;
    readonly total: Money;
  };
  /** Refunded so far (cancellations, admin refunds). */
  readonly refunded: Money;
  readonly promoCode: string | null;
  readonly address: OrderRow['shippingAddress'];
  readonly shipping: {
    readonly label: string;
    readonly earliest: Date;
    readonly latest: Date;
  };
  readonly payment: { readonly brand: string; readonly last4: string } | undefined;
}

export async function findOrderView(db: Db, number: string): Promise<OrderView | undefined> {
  const order = await findOrderByNumber(db, number);
  if (order === undefined) return undefined;
  const [lines, payment] = await Promise.all([orderLinesOf(db, order.id), paymentOf(db, order.id)]);
  const method = isShippingMethod(order.shippingMethod) ? order.shippingMethod : 'standard';
  const label =
    shippingOptions(usd(order.subtotalCents)).find((o) => o.method === method)?.label ?? method;
  return {
    id: order.id,
    number: order.number,
    userId: order.userId,
    email: order.email,
    status: order.status,
    placedAt: order.createdAt,
    lines: lines.map((l) => ({
      name: l.productName,
      variant: l.variantLabel,
      quantity: l.quantity,
      unit: usd(l.unitPriceCents),
      lineTotal: usd(l.lineTotalCents),
    })),
    totals: {
      subtotal: usd(order.subtotalCents),
      discount: usd(order.discountCents),
      shipping: usd(order.shippingCents),
      tax: usd(order.taxCents),
      total: usd(order.totalCents),
    },
    refunded: usd(order.refundedCents),
    promoCode: order.promoCode,
    address: order.shippingAddress,
    shipping: { label, ...estimatedDelivery(method, order.createdAt) },
    payment,
  };
}

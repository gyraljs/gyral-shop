// Order history, order detail, member cancellation and guest lookup
// (docs/product-specs/orders.md). Cancelling: claim it in one transaction (status, stock,
// timeline), then refund through the payment provider; a failed refund leaves the order
// cancelled with a timeline note and the customer is told a person will refund them.
import {
  countMemberOrders,
  claimCancellation,
  findOrderByNumberAndEmail,
  memberOrderRows,
  orderEventsOf,
  paymentRefOf,
  recordRefund,
  addOrderEvent,
  type OrderEventRow,
  type OrderSummaryRow,
} from '../db/repos/order-history.js';
import { findOrderByNumber } from '../db/repos/orders.js';
import type { Db } from '../db/client.js';
import { writeTransaction } from '../db/tx.js';
import { format, usd, type Money } from '../domain/money.js';
import { transition, transitionErrorMessage } from '../domain/orders.js';
import { err, ok, type Result } from '../domain/result.js';
import type { Services } from './container.js';
import { orderCancelledMail } from './mail.js';
import { findOrderView, type OrderView } from './order-view.js';

export const ORDERS_PER_PAGE = 10;

export interface OrderHistoryPage {
  readonly orders: readonly OrderSummaryRow[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
}

/** Page `page` (1-based) of a member's history; `undefined` when the page doesn't exist. */
export async function memberOrderHistory(
  db: Db,
  userId: number,
  page: number,
): Promise<OrderHistoryPage | undefined> {
  const total = await countMemberOrders(db, userId);
  const pages = Math.max(1, Math.ceil(total / ORDERS_PER_PAGE));
  if (!Number.isInteger(page) || page < 1 || page > pages) return undefined;
  const orders = await memberOrderRows(db, userId, {
    limit: ORDERS_PER_PAGE,
    offset: (page - 1) * ORDERS_PER_PAGE,
  });
  return { orders, page, pages, total };
}

export interface OrderDetail extends OrderView {
  readonly events: readonly OrderEventRow[];
  /** A member may cancel while the order is paid and not yet fulfilled. */
  readonly canCancel: boolean;
}

export async function findOrderDetail(db: Db, number: string): Promise<OrderDetail | undefined> {
  const view = await findOrderView(db, number);
  if (view === undefined) return undefined;
  const events = await orderEventsOf(db, view.id);
  return { ...view, events, canCancel: view.status === 'paid' };
}

export type CancelError =
  { readonly _tag: 'NotFound' } | { readonly _tag: 'NotCancellable'; readonly message: string };

export interface Cancelled {
  /** Undefined when the refund failed and must be made by hand. */
  readonly refunded: Money | undefined;
}

/** Cancels a member's own paid order: stock back, payment refunded, email sent. */
export async function cancelMemberOrder(
  services: Services,
  input: { readonly userId: number; readonly number: string; readonly origin: string },
): Promise<Result<Cancelled, CancelError>> {
  const { db, payments, mailer } = services;
  const now = services.now();
  const order = await findOrderByNumber(db, input.number);
  if (order === undefined || order.userId !== input.userId) return err({ _tag: 'NotFound' });

  const state = {
    status: order.status,
    total: usd(order.totalCents),
    refunded: usd(order.refundedCents),
  };
  const next = transition(state, { _tag: 'Cancel' });
  if (!next.ok || order.status !== 'paid') {
    return err({
      _tag: 'NotCancellable',
      message: next.ok
        ? 'This order can no longer be cancelled.'
        : transitionErrorMessage(next.error),
    });
  }
  const claimed = await writeTransaction(db, (tx) => claimCancellation(tx, order, now));
  if (!claimed) {
    return err({
      _tag: 'NotCancellable',
      message: 'This order changed and can no longer be cancelled.',
    });
  }

  const total = usd(order.totalCents);
  let refunded: Money | undefined;
  const ref = await paymentRefOf(db, order.id);
  const refund = ref === undefined ? undefined : await payments.refund(ref);
  if (refund?.ok === true) {
    refunded = total;
    const card = `${refund.value.brand} •••• ${refund.value.last4}`;
    await writeTransaction(db, (tx) =>
      recordRefund(tx, order.id, total.cents, `Refunded ${format(total)} to ${card}`, now),
    );
  } else {
    console.error(
      `order ${order.number}: refund failed`,
      refund?.ok === false ? refund.error : 'no payment',
    );
    await writeTransaction(db, (tx) =>
      addOrderEvent(
        tx,
        order.id,
        'cancelled',
        'Refund pending: our team will refund you by hand',
        now,
      ),
    );
  }

  try {
    await mailer.send(
      orderCancelledMail({
        to: order.email,
        name: order.shippingAddress.name,
        orderNumber: order.number,
        orderUrl: `${input.origin}/account/orders/${order.number}`,
        refunded,
      }),
    );
  } catch (error) {
    console.error(`order ${order.number}: cancellation email failed`, error);
  }
  return ok({ refunded });
}

/** The order number if this number + email identify a placed order, for guest lookup. */
export async function lookupGuestOrder(
  db: Db,
  number: string,
  email: string,
): Promise<string | undefined> {
  return (await findOrderByNumberAndEmail(db, number.trim().toUpperCase(), email))?.number;
}

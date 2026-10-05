// Admin orders (docs/product-specs/admin.md, "Orders"): list, detail and status changes through
// the domain state machine (src/domain/orders.ts). Each change is claimed with a conditional
// update before any money moves; a refund the provider refuses is undone and noted.
import {
  adminOrderRows,
  claimRefund,
  claimStatus,
  countAdminOrders,
  releaseRefund,
  type AdminOrderQuery,
} from '../db/repos/admin-orders.js';
import {
  addOrderEvent,
  claimCancellation,
  orderEventsOf,
  paymentRefOf,
  recordRefund,
} from '../db/repos/order-history.js';
import { findOrderByNumber, type OrderRow } from '../db/repos/orders.js';
import type { Db } from '../db/client.js';
import { writeTransaction } from '../db/tx.js';
import {
  ORDER_ACTIONS,
  ORDERS_PER_ADMIN_PAGE,
  type AdminOrder,
  type AdminOrderList,
  type OrderAction,
} from '../domain/admin.js';
import { format, usd, type Money } from '../domain/money.js';
import {
  allowedEvents,
  refundable,
  transition,
  transitionErrorMessage,
  type OrderState,
} from '../domain/orders.js';
import { err, ok, type Result } from '../domain/result.js';
import { requireRole, type Actor } from './authz.js';
import type { AdminError } from './admin-products.js';
import type { Services } from './container.js';
import { orderCancelledMail, orderRefundedMail, orderShippedMail } from './mail.js';
import { findOrderView } from './order-view.js';

export type OrderChangeError = AdminError | { readonly _tag: 'Conflict'; readonly message: string };

const CHANGED = 'This order changed while you were looking at it. Reload it and try again.';

const stateOf = (order: Pick<OrderRow, 'status' | 'totalCents' | 'refundedCents'>): OrderState => ({
  status: order.status,
  total: usd(order.totalCents),
  refunded: usd(order.refundedCents),
});

/** Actions the admin may take now: the state machine's events, with Cancel only while paid. */
export function orderActions(order: Pick<OrderRow, 'status' | 'totalCents' | 'refundedCents'>) {
  const events = allowedEvents(order.status);
  return ORDER_ACTIONS.filter((action) =>
    action === 'Cancel'
      ? order.status === 'paid'
      : action === 'Refund'
        ? events.includes('Refund') && refundable(stateOf(order)).cents > 0
        : events.includes(action),
  );
}

export async function listOrders(
  db: Db,
  actor: Actor,
  query: AdminOrderQuery & { readonly page: number },
): Promise<Result<AdminOrderList, AdminError>> {
  const allowed = requireRole(actor, 'admin');
  if (!allowed.ok) return err(allowed.error);
  const total = await countAdminOrders(db, query);
  const pages = Math.max(1, Math.ceil(total / ORDERS_PER_ADMIN_PAGE));
  if (query.page > pages) return err({ _tag: 'NotFound' });
  const rows = await adminOrderRows(db, query, {
    limit: ORDERS_PER_ADMIN_PAGE,
    offset: (query.page - 1) * ORDERS_PER_ADMIN_PAGE,
  });
  return ok({
    rows: rows.map(({ address, placedAt, ...row }) => ({
      ...row,
      name: address.name,
      placedAt: placedAt.toISOString(),
    })),
    page: query.page,
    pages,
    total,
  });
}

export async function adminOrder(
  db: Db,
  actor: Actor,
  number: string,
): Promise<Result<AdminOrder, AdminError>> {
  const allowed = requireRole(actor, 'admin');
  if (!allowed.ok) return err(allowed.error);
  const [view, row] = await Promise.all([findOrderView(db, number), findOrderByNumber(db, number)]);
  if (view === undefined || row === undefined) return err({ _tag: 'NotFound' });
  const events = await orderEventsOf(db, view.id);
  const { name, line1, line2, city, state, postalCode } = view.address;
  return ok({
    number: view.number,
    status: view.status,
    email: view.email,
    placedAt: view.placedAt.toISOString(),
    lines: view.lines.map((l) => ({
      name: l.name,
      variant: l.variant,
      quantity: l.quantity,
      unitCents: l.unit.cents,
      totalCents: l.lineTotal.cents,
    })),
    totals: {
      subtotal: view.totals.subtotal.cents,
      discount: view.totals.discount.cents,
      shipping: view.totals.shipping.cents,
      tax: view.totals.tax.cents,
      total: view.totals.total.cents,
    },
    refundedCents: view.refunded.cents,
    refundableCents: refundable(stateOf(row)).cents,
    promoCode: view.promoCode,
    address: { name, line1, line2, city, state, postalCode },
    shipping: view.shipping.label,
    payment: view.payment ?? null,
    events: events.map((e) => ({ status: e.status, note: e.note, at: e.at.toISOString() })),
    actions: [...orderActions(row)],
  });
}

export interface OrderChange {
  readonly number: string;
  readonly action: OrderAction;
  /** Refunds only. */
  readonly amountCents?: number;
  /** Absolute origin for links in emails. */
  readonly origin: string;
}

async function notify(services: Services, label: string, send: () => Promise<unknown>) {
  try {
    await send();
  } catch (error) {
    console.error(`${label}: email failed`, error);
  }
}

export async function changeOrder(
  services: Services,
  actor: Actor,
  change: OrderChange,
): Promise<
  Result<{ readonly status: OrderRow['status']; readonly notice: string }, OrderChangeError>
> {
  const allowed = requireRole(actor, 'admin');
  if (!allowed.ok) return err(allowed.error);
  const { db, payments, mailer } = services;
  const now = services.now();
  const order = await findOrderByNumber(db, change.number);
  if (order === undefined) return err({ _tag: 'NotFound' });
  const mail = {
    to: order.email,
    name: order.shippingAddress.name,
    orderNumber: order.number,
    orderUrl: `${change.origin}/order/${order.number}`,
  };
  const conflict = (message: string) => err({ _tag: 'Conflict' as const, message });

  if (change.action === 'Fulfil' || change.action === 'Deliver') {
    const next = transition(stateOf(order), { _tag: change.action });
    if (!next.ok) return conflict(transitionErrorMessage(next.error));
    const to = next.value.state.status;
    const note = change.action === 'Fulfil' ? 'Shipped' : 'Delivered';
    const claimed = await writeTransaction(db, (tx) =>
      claimStatus(tx, order, { from: order.status, to, note }, now),
    );
    if (!claimed) return conflict(CHANGED);
    if (change.action === 'Fulfil')
      await notify(services, order.number, () => mailer.send(orderShippedMail(mail)));
    return ok({
      status: to,
      notice: change.action === 'Fulfil' ? 'Marked as shipped.' : 'Marked as delivered.',
    });
  }

  const ref = await paymentRefOf(db, order.id);
  const card = (p: { brand: string; last4: string }) => `${p.brand} •••• ${p.last4}`;

  if (change.action === 'Cancel') {
    if (order.status !== 'paid')
      return conflict('Only paid orders that haven’t shipped can be cancelled.');
    const claimed = await writeTransaction(db, (tx) =>
      claimCancellation(tx, order, now, 'Cancelled by the store'),
    );
    if (!claimed) return conflict(CHANGED);
    const total = usd(order.totalCents);
    const refund = ref === undefined ? undefined : await payments.refund(ref);
    let refunded: Money | undefined;
    if (refund?.ok === true) {
      refunded = total;
      await writeTransaction(db, (tx) =>
        recordRefund(
          tx,
          order.id,
          total.cents,
          `Refunded ${format(total)} to ${card(refund.value)}`,
          now,
        ),
      );
    } else {
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
    await notify(services, order.number, () =>
      mailer.send(orderCancelledMail({ ...mail, refunded })),
    );
    return ok({
      status: 'cancelled',
      notice:
        refunded === undefined
          ? 'Cancelled. The automatic refund failed: refund the customer by hand.'
          : `Cancelled and refunded ${format(refunded)}.`,
    });
  }

  // Refund
  const amount = usd(change.amountCents ?? 0);
  const next = transition(stateOf(order), { _tag: 'Refund', amount });
  if (!next.ok) {
    return next.error._tag === 'InvalidRefundAmount'
      ? err({
          _tag: 'Invalid',
          issues: [{ path: 'amount', message: transitionErrorMessage(next.error) }],
        })
      : conflict(transitionErrorMessage(next.error));
  }
  const claimedState = {
    status: next.value.state.status,
    refundedCents: next.value.state.refunded.cents,
  };
  if (ref === undefined) return conflict('This order has no captured payment to refund.');
  const claimed = await writeTransaction(db, (tx) => claimRefund(tx, order, claimedState, now));
  if (!claimed) return conflict(CHANGED);
  const refund = await payments.refund(ref, amount);
  if (!refund.ok) {
    await writeTransaction(db, (tx) =>
      releaseRefund(
        tx,
        order,
        claimedState,
        `Refund of ${format(amount)} failed: nothing was refunded`,
        now,
      ),
    );
    return conflict('The payment provider refused the refund. Nothing was refunded.');
  }
  await writeTransaction(db, (tx) =>
    addOrderEvent(
      tx,
      order.id,
      claimedState.status,
      `Refunded ${format(amount)} to ${card(refund.value)}`,
      now,
    ),
  );
  await notify(services, order.number, () => mailer.send(orderRefundedMail({ ...mail, amount })));
  return ok({ status: claimedState.status, notice: `Refunded ${format(amount)}.` });
}

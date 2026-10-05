// Pieces shared by the order confirmation, order detail and order history pages
// (docs/product-specs/orders.md). Server-rendered light DOM; theme hooks per ADR 0006.
import { html, nothing } from '@gyral/core';
import { addressLines } from '../../domain/checkout.js';
import { format, type Money } from '../../domain/money.js';

export type OrderStatusName =
  | 'pending_payment'
  | 'paid'
  | 'fulfilled'
  | 'delivered'
  | 'cancelled'
  | 'partially_refunded'
  | 'refunded';

export const STATUS_LABEL: Readonly<Record<OrderStatusName, string>> = {
  pending_payment: 'Awaiting payment',
  paid: 'Paid',
  fulfilled: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
};

export const statusBadge = (status: OrderStatusName) =>
  html`<span class="order-status" data-component="order-status" data-status=${status}
    >${STATUS_LABEL[status]}</span
  >`;

export const BRAND: Readonly<Record<string, string>> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
};

export const day = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export const longDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface OrderLineData {
  readonly name: string;
  readonly variant: string;
  readonly quantity: number;
  readonly unit: Money;
  readonly lineTotal: Money;
}

export interface OrderTotalsData {
  readonly subtotal: Money;
  readonly discount: Money;
  readonly shipping: Money;
  readonly tax: Money;
  readonly total: Money;
}

export interface OrderAddressData {
  readonly name: string;
  readonly line1: string;
  readonly line2: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly phone: string;
}

const totalRow = (label: string, amount: Money, negative = false) =>
  html`<div class="row">
    <dt>${label}</dt>
    <dd data-component="price">${negative ? `−${format(amount)}` : format(amount)}</dd>
  </div>`;

export const addressBlock = (address: OrderAddressData) =>
  html`<address>${addressLines(address).map((line) => html`${line}<br />`)}</address>`;

export const orderLinesSection = (lines: readonly OrderLineData[]) => html`
  <section data-region="order-lines" aria-labelledby="items-title">
    <h2 id="items-title">Items</h2>
    <table class="order-lines">
      <thead>
        <tr>
          <th scope="col">Item</th>
          <th scope="col">Qty</th>
          <th scope="col">Price</th>
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lines.map(
          (l) =>
            html`<tr data-component="order-line">
              <th scope="row">
                ${l.name}${l.variant === '' ? nothing : html`<br /><small>${l.variant}</small>`}
              </th>
              <td>${l.quantity}</td>
              <td data-component="price">${format(l.unit)}</td>
              <td data-component="price">${format(l.lineTotal)}</td>
            </tr>`,
        )}
      </tbody>
    </table>
  </section>
`;

export const orderTotalsSection = (o: {
  readonly totals: OrderTotalsData;
  readonly promoCode: string | null;
  readonly payment: { readonly brand: string; readonly last4: string } | undefined;
  readonly refunded?: Money;
}) => html`
  <section class="totals" data-region="order-totals" aria-labelledby="totals-title">
    <h2 id="totals-title">Summary</h2>
    <dl>
      ${totalRow('Subtotal', o.totals.subtotal)}
      ${
        o.totals.discount.cents === 0
          ? nothing
          : totalRow(
              o.promoCode === null ? 'Discount' : `Discount (${o.promoCode})`,
              o.totals.discount,
              true,
            )
      }
      ${totalRow('Shipping', o.totals.shipping)} ${totalRow('Tax', o.totals.tax)}
      <div class="row total">
        <dt>Total charged</dt>
        <dd data-component="price">${format(o.totals.total)}</dd>
      </div>
      ${
        o.refunded === undefined || o.refunded.cents === 0
          ? nothing
          : html`<div class="row refunded">
              <dt>Refunded</dt>
              <dd data-component="price">−${format(o.refunded)}</dd>
            </div>`
      }
    </dl>
    ${
      o.payment === undefined
        ? nothing
        : html`<p>
            Paid with ${BRAND[o.payment.brand] ?? o.payment.brand} ending ${o.payment.last4}.
          </p>`
    }
  </section>
`;

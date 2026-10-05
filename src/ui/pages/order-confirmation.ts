// Order confirmation (docs/product-specs/checkout.md): server-rendered light DOM, no script
// needed. Theme hooks per docs/design-docs/0006-theming.md.
import { html, nothing } from '@gyral/core';
import { addressLines } from '../../domain/checkout.js';
import { format, type Money } from '../../domain/money.js';

/** Plain data; the server maps its order view into this (ui/ never imports services). */
export interface ConfirmationData {
  readonly number: string;
  readonly email: string;
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
  readonly promoCode: string | null;
  readonly address: {
    readonly name: string;
    readonly line1: string;
    readonly line2: string;
    readonly city: string;
    readonly state: string;
    readonly postalCode: string;
    readonly phone: string;
  };
  readonly shipping: { readonly label: string; readonly earliest: Date; readonly latest: Date };
  readonly payment: { readonly brand: string; readonly last4: string } | undefined;
}

const day = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const iso = (d: Date) => d.toISOString().slice(0, 10);

const BRAND: Readonly<Record<string, string>> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
};

const totalRow = (label: string, amount: Money, negative = false) =>
  html`<div class="row">
    <dt>${label}</dt>
    <dd data-component="price">${negative ? `−${format(amount)}` : format(amount)}</dd>
  </div>`;

export const orderConfirmationPage = (o: ConfirmationData) => html`
  <article class="confirmation" data-region="order-confirmation" aria-labelledby="title">
    <header>
      <h1 id="title">Thank you, your order is placed</h1>
      <p>
        Order number <strong data-component="order-number">${o.number}</strong>. We sent a
        confirmation to <strong>${o.email}</strong>.
      </p>
    </header>

    <section class="delivery" data-region="delivery" aria-labelledby="delivery-title">
      <h2 id="delivery-title">Delivery</h2>
      <p>
        ${o.shipping.label}: arrives
        <time datetime=${iso(o.shipping.earliest)}>${day.format(o.shipping.earliest)}</time> –
        <time datetime=${iso(o.shipping.latest)}>${day.format(o.shipping.latest)}</time>
      </p>
      <address>${addressLines(o.address).map((line) => html`${line}<br />`)}</address>
    </section>

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
          ${o.lines.map(
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
      </dl>
      ${
        o.payment === undefined
          ? nothing
          : html`<p>
              Paid with ${BRAND[o.payment.brand] ?? o.payment.brand} ending ${o.payment.last4}.
            </p>`
      }
    </section>

    <p class="next"><a href="/">Continue shopping</a></p>
  </article>
`;

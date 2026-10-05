// Order confirmation (docs/product-specs/checkout.md): server-rendered light DOM, no script
// needed. Theme hooks per docs/design-docs/0006-theming.md.
import { html } from '@gyral/core';
import type { Money } from '../../domain/money.js';
import { addressBlock, day, iso, orderLinesSection, orderTotalsSection } from '../orders/parts.js';

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
      ${addressBlock(o.address)}
    </section>

    ${orderLinesSection(o.lines)} ${orderTotalsSection(o)}

    <p class="next"><a href="/">Continue shopping</a></p>
  </article>
`;

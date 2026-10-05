// An order's page (docs/product-specs/orders.md): lines and totals as charged, shipping
// address, payment, status timeline, and cancellation while it is still possible.
// Server-rendered light DOM; the cancel form works without JavaScript.
import { html, nothing } from '@gyral/core';
import type { Money } from '../../domain/money.js';
import { csrfField } from '../forms/csrf.js';
import {
  addressBlock,
  iso,
  longDate,
  orderLinesSection,
  orderTotalsSection,
  statusBadge,
  STATUS_LABEL,
  type OrderAddressData,
  type OrderLineData,
  type OrderStatusName,
  type OrderTotalsData,
} from '../orders/parts.js';

export interface OrderDetailData {
  readonly number: string;
  readonly status: OrderStatusName;
  readonly placedAt: Date;
  readonly lines: readonly OrderLineData[];
  readonly totals: OrderTotalsData;
  readonly refunded: Money;
  readonly promoCode: string | null;
  readonly address: OrderAddressData;
  readonly shipping: { readonly label: string };
  readonly payment: { readonly brand: string; readonly last4: string } | undefined;
  readonly events: readonly {
    readonly status: OrderStatusName;
    readonly note: string | null;
    readonly at: Date;
  }[];
  /** Present when the viewer may cancel: the form posts here with this CSRF token. */
  readonly cancel?: { readonly action: string; readonly csrf: string };
  /** Where "back" goes: the member's order list, or the guest lookup. */
  readonly back: { readonly href: string; readonly label: string };
  readonly flash?: { readonly kind: 'success' | 'error'; readonly message: string };
}

const time = (d: Date) => html`<time datetime=${d.toISOString()}>${longDate.format(d)}</time>`;

export const orderDetailPage = (o: OrderDetailData) => html`
  <article class="order-page order-detail" data-region="order-detail" aria-labelledby="title">
    <header>
      <nav class="crumbs" aria-label="Breadcrumb"><a href=${o.back.href}>${o.back.label}</a></nav>
      <h1 id="title">Order <span data-component="order-number">${o.number}</span></h1>
      <p>
        Placed <time datetime=${iso(o.placedAt)}>${longDate.format(o.placedAt)}</time>
        ${statusBadge(o.status)}
      </p>
    </header>
    ${
      o.flash === undefined
        ? nothing
        : html`<p class="notice" data-component="notice" data-kind=${o.flash.kind} role="status">
            ${o.flash.message}
          </p>`
    }

    <section data-region="order-timeline" aria-labelledby="timeline-title">
      <h2 id="timeline-title">Status</h2>
      <ol class="timeline">
        ${o.events.map(
          (e) =>
            html`<li data-component="order-event" data-status=${e.status}>
              ${time(e.at)} <strong>${STATUS_LABEL[e.status]}</strong>${
                e.note === null ? nothing : html` — ${e.note}`
              }
            </li>`,
        )}
      </ol>
    </section>

    <section class="delivery" data-region="delivery" aria-labelledby="delivery-title">
      <h2 id="delivery-title">Delivery</h2>
      <p>${o.shipping.label}</p>
      ${addressBlock(o.address)}
    </section>

    ${orderLinesSection(o.lines)} ${orderTotalsSection(o)}
    ${
      o.cancel === undefined
        ? nothing
        : html`<section data-region="order-cancel" aria-labelledby="cancel-title">
            <h2 id="cancel-title">Cancel order</h2>
            <details>
              <summary>Cancel this order</summary>
              <form method="post" action=${o.cancel.action} data-component="cancel-form">
                ${csrfField(o.cancel.csrf)}
                <p>
                  We'll refund the full amount to your card and put the items back on the shelf.
                  This can't be undone.
                </p>
                <button type="submit">Yes, cancel order ${o.number}</button>
              </form>
            </details>
          </section>`
    }
  </article>
`;

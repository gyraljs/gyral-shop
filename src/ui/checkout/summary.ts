// The order summary beside the checkout steps: lines and itemized totals, exactly as the
// domain price pipeline computed them on the server.
import { html, nothing } from '@gyral/core';
import { format } from '../../domain/money.js';
import type { CheckoutClient } from './model.js';

const options = (o: Readonly<Record<string, string>>) =>
  Object.entries(o)
    .map(([k, value]) => `${k}: ${value}`)
    .join(', ');

export function orderSummary(view: CheckoutClient) {
  const t = view.totals;
  return html`<aside
    class="order-summary"
    data-component="order-summary"
    part="order-summary"
    aria-labelledby="summary-heading"
  >
    <h2 id="summary-heading">Order summary</h2>
    <ul class="summary-lines">
      ${view.lines.map(
        (line) =>
          html`<li data-component="summary-line">
            <span class="name"
              >${line.name}${line.quantity > 1 ? html` × ${line.quantity}` : nothing}</span
            >
            ${
              Object.keys(line.options).length === 0
                ? nothing
                : html`<span class="options">${options(line.options)}</span>`
            }
            <span class="amount" data-component="price">${format(line.lineTotal)}</span>
          </li>`,
      )}
    </ul>
    <dl class="totals">
      <div>
        <dt>Subtotal</dt>
        <dd>${format(t.subtotal)}</dd>
      </div>
      ${
        t.discount.cents > 0
          ? html`<div class="discount">
              <dt>Discount${t.promoCode === undefined ? nothing : html` (${t.promoCode})`}</dt>
              <dd>−${format(t.discount)}</dd>
            </div>`
          : nothing
      }
      <div>
        <dt>Shipping</dt>
        <dd>${t.shipping.cents === 0 ? 'Free' : format(t.shipping)}</dd>
      </div>
      <div>
        <dt>Tax</dt>
        <dd>${t.taxPending ? 'Calculated after the address' : format(t.tax)}</dd>
      </div>
      <div class="total">
        <dt>Total</dt>
        <dd data-component="price">${format(t.total)}</dd>
      </div>
    </dl>
    <p><a href="/cart">Edit cart</a></p>
  </aside>`;
}

// The cart page's order summary: itemized totals from the domain price pipeline, promo code
// entry/removal and the way to checkout.
import { html, nothing } from '@gyral/core';
import { format } from '../../domain/money.js';
import { csrfField } from '../forms/csrf.js';
import type { CartClient } from './model.js';

export interface SummaryIntents {
  readonly ApplyPromo: string;
  readonly RemovePromo: string;
}

const promoBlock = (
  cart: CartClient,
  csrf: string,
  i: SummaryIntents,
  error: string | undefined,
) =>
  cart.promo === undefined
    ? html`
        <form method="post" action="/cart/promo" data-intent=${i.ApplyPromo} class="promo">
          ${csrfField(csrf)}
          <label for="promo-code">Promo code</label>
          <span class="row">
            <input
              id="promo-code"
              name="code"
              required
              maxlength="32"
              autocomplete="off"
              aria-invalid=${error === undefined ? nothing : 'true'}
              aria-describedby=${error === undefined ? nothing : 'promo-error'}
            />
            <button type="submit">Apply</button>
          </span>
          ${error === undefined ? nothing : html`<p class="error" id="promo-error">${error}</p>`}
        </form>
      `
    : html`
        <div class="promo applied">
          <p>
            Promo code <strong>${cart.promo.code}</strong>
            ${cart.promo.applied ? 'applied.' : html`not applied: ${cart.promo.message ?? ''}`}
          </p>
          <form method="post" action="/cart/promo/remove" data-intent=${i.RemovePromo}>
            ${csrfField(csrf)}
            <button type="submit" class="link">Remove code</button>
          </form>
        </div>
      `;

export function cartSummary(
  cart: CartClient,
  updating: boolean,
  csrf: string,
  i: SummaryIntents,
  promoError: string | undefined,
) {
  const t = cart.totals;
  return html`
    <section
      class="summary"
      aria-labelledby="summary-heading"
      aria-busy=${updating ? 'true' : 'false'}
    >
      <h2 id="summary-heading">Order summary</h2>
      <dl>
        <div>
          <dt>Subtotal (${cart.itemCount} ${cart.itemCount === 1 ? 'item' : 'items'})</dt>
          <dd>${format(t.subtotal)}</dd>
        </div>
        ${
          t.discount.cents > 0
            ? html`<div class="discount">
                <dt>Promo discount</dt>
                <dd>−${format(t.discount)}</dd>
              </div>`
            : nothing
        }
        <div>
          <dt>Shipping (Standard)</dt>
          <dd>${t.shipping.cents === 0 ? 'Free' : format(t.shipping)}</dd>
        </div>
        <div>
          <dt>Tax</dt>
          <dd>${t.taxPending ? 'Calculated at checkout' : format(t.tax)}</dd>
        </div>
        <div class="total">
          <dt>Estimated total</dt>
          <dd>${format(t.total)}</dd>
        </div>
      </dl>
      ${
        t.savings.cents > 0
          ? html`<p class="savings">You save ${format(t.savings)} with sale prices.</p>`
          : nothing
      }
      ${updating ? html`<p class="updating">Updating totals…</p>` : nothing}
      ${promoBlock(cart, csrf, i, promoError)}
      ${
        cart.canCheckout
          ? html`<a class="button primary" href="/checkout">Checkout</a>`
          : html`
              <button
                type="button"
                class="button primary"
                disabled
                aria-describedby="checkout-blocked"
              >
                Checkout
              </button>
              <p id="checkout-blocked" class="blocked">
                Update or remove the items marked above to check out.
              </p>
            `
      }
      <p><a href="/">Continue shopping</a></p>
    </section>
  `;
}

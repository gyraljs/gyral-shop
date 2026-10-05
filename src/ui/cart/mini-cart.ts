import { css, define, html, nothing, repeat, type Stateless } from '@gyral/core';
import { format } from '../../domain/money.js';
import type { CartClient } from './model.js';
import { cartStore } from './store.js';

const SHOWN_LINES = 5;

const itemsLabel = (n: number) => `${String(n)} item${n === 1 ? '' : 's'}`;

const panel = (cart: CartClient) =>
  cart.lines.length === 0
    ? html`<p>Your cart is empty.</p>`
    : html`
        <ul>
          ${repeat(
            cart.lines.slice(0, SHOWN_LINES),
            (l) => l.sku,
            (l) =>
              html`<li>
                <a href=${l.href}>${l.productName}</a>
                <span class="qty">× ${l.quantity}</span>
                <span class="amount">${format(l.lineTotal)}</span>
              </li>`,
          )}
        </ul>
        ${
          cart.lines.length > SHOWN_LINES
            ? html`<p class="more">and ${cart.lines.length - SHOWN_LINES} more</p>`
            : nothing
        }
        <p class="subtotal">
          <span>Subtotal</span> <strong>${format(cart.totals.subtotal)}</strong>
        </p>
        <p class="actions">
          <a href="/cart">View cart</a>
          ${cart.canCheckout ? html`<a class="primary" href="/checkout">Checkout</a>` : nothing}
        </p>
      `;

/**
 * The header's cart entry point: a count badge and a summary panel, read from the shared cart
 * store on every page. A <details> disclosure, so it opens without JavaScript too.
 */
export const MiniCart = define<Stateless, never>('shop-mini-cart', {
  stores: [cartStore],
  intent: {},
  update: {},
  view: (_s, _i, { read }) => {
    const { cart, inFlight } = read(cartStore);
    if (cart === undefined) return html`<a class="plain" href="/cart">Cart</a>`;
    return html`
      <details class="mini-cart" aria-busy=${inFlight > 0 ? 'true' : 'false'}>
        <summary>
          Cart<span class="badge" aria-hidden="true">${cart.itemCount}</span
          ><span class="visually-hidden">, ${itemsLabel(cart.itemCount)}</span>
        </summary>
        <div class="panel">${panel(cart)}</div>
      </details>
    `;
  },
  styles: css`
    :host {
      display: inline-block;
      position: relative;
    }
    a,
    summary {
      color: inherit;
    }
    summary {
      cursor: pointer;
      list-style-position: inside;
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
    }
    .badge {
      min-inline-size: 1.4em;
      padding-inline: 0.35em;
      border-radius: 1em;
      background: var(--brand-ink);
      color: var(--brand);
      font-size: 0.8rem;
      font-weight: 700;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .panel {
      position: absolute;
      inset-inline-end: 0;
      inset-block-start: calc(100% + var(--space-1));
      z-index: 10;
      inline-size: min(22rem, 90vw);
      padding: var(--space-3);
      background: var(--surface-raised);
      color: var(--ink);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: 0 0.5rem 1.5rem oklch(0% 0 0 / 0.15);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-2);
    }
    li {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: var(--space-2);
      align-items: baseline;
    }
    li a {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .qty,
    .more {
      color: var(--ink-muted);
    }
    .amount,
    .subtotal strong {
      font-variant-numeric: tabular-nums;
    }
    .subtotal {
      display: flex;
      justify-content: space-between;
      border-block-start: 1px solid var(--line);
      padding-block-start: var(--space-2);
    }
    .actions {
      display: flex;
      gap: var(--space-2);
      justify-content: flex-end;
      margin-block-end: 0;
    }
    .actions a {
      padding: var(--space-1) var(--space-3);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius);
      text-decoration: none;
    }
    .actions a.primary {
      background: var(--brand);
      border-color: var(--brand);
      color: var(--brand-ink);
    }
    [aria-busy='true'] .panel {
      opacity: 0.7;
    }
    :focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }
    .visually-hidden {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-mini-cart': InstanceType<typeof MiniCart>;
  }
}

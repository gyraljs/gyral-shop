// The cart page (docs/product-specs/cart.md). Server-rendered from the seeded cart store; every
// control is a POST form. With JavaScript, the same forms become intents that send messages
// to the shared store, which updates optimistically and reconciles with the JSON API.
import { define, fieldErrors, form, html, send, unsafeCSS } from '@gyral/core';
import { cartCss } from '../styles/cart.js';
import { shadowBaseCss } from '../styles/shadow-base.js';
import { cartLines } from './cart-lines.js';
import { cartSummary } from './cart-summary.js';
import { PromoForm, RemoveForm, SetQuantityForm } from './schemas.js';
import { cartStore, type CartNotice } from './store.js';

export interface Flash {
  readonly kind: 'success' | 'error';
  readonly message: string;
}

export interface CartPageProps {
  /** For the no-JS forms (the JS path reads the page's <meta> token). */
  readonly csrf?: string;
  /** A one-shot message carried across a no-JS form post (server flash). */
  readonly flash?: Flash;
}

export interface CartPageState {
  /** A client-side validation error for the promo form. */
  readonly promoError: string | undefined;
}

export type CartPageMsg =
  | { readonly _tag: 'SetQuantity'; readonly sku: string; readonly quantity: number }
  | { readonly _tag: 'Remove'; readonly sku: string }
  | { readonly _tag: 'ApplyPromo'; readonly code: string }
  | { readonly _tag: 'RemovePromo' };

/** Store notices shown on the cart page (the buy box shows its own `add` notices). */
const PAGE_OPS: readonly CartNotice['op'][] = ['update', 'remove', 'promo', 'refresh', 'add'];

export const CartPage = define<CartPageState, CartPageMsg, CartPageProps>('shop-cart-page', {
  props: { csrf: { type: String }, flash: { attribute: false } },
  stores: [cartStore],
  init: () => ({ promoError: undefined }),
  intent: {
    SetQuantity: form(SetQuantityForm, (d) => ({
      _tag: 'SetQuantity',
      sku: d.sku,
      quantity: d.quantity,
    })),
    Remove: form(RemoveForm, (d) => ({ _tag: 'Remove', sku: d.sku })),
    ApplyPromo: form(PromoForm, (d) => ({ _tag: 'ApplyPromo', code: d.code })),
    RemovePromo: () => ({ _tag: 'RemovePromo' }),
  },
  update: {
    SetQuantity: (s, m) => [s, [send(cartStore, m)]],
    Remove: (s, m) => [s, [send(cartStore, m)]],
    ApplyPromo: (s, m) => [{ promoError: undefined }, [send(cartStore, m)]],
    RemovePromo: (s, m) => [s, [send(cartStore, m)]],
    IntentRejected: (s, m) =>
      m.intent === 'ApplyPromo'
        ? { promoError: fieldErrors(m.issues)['code']?.[0] ?? 'Enter a promo code.' }
        : s,
  },
  view: (s, i, { props, read }) => {
    const { cart, notice, inFlight } = read(cartStore);
    const csrf = props.csrf ?? '';
    const shown = notice !== undefined && PAGE_OPS.includes(notice.op) ? notice : props.flash;
    return html`
      <h1>Your cart</h1>
      <p class="notice ${shown?.kind ?? ''}" part="notice" role="status">${shown?.message ?? ''}</p>
      ${
        cart === undefined
          ? html`<p>Loading your cart…</p>`
          : cart.lines.length === 0
            ? html`<div class="empty" part="empty">
                <p>Your cart is empty.</p>
                <p><a class="button primary" href="/">Continue shopping</a></p>
              </div>`
            : html`<div class="layout">
                <section data-region="cart-lines" aria-labelledby="items-heading">
                  <h2 id="items-heading" class="visually-hidden">Items</h2>
                  ${cartLines(cart.lines, csrf, i)}
                </section>
                ${cartSummary(cart, inFlight > 0, csrf, i, s.promoError)}
              </div>`
      }
    `;
  },
  styles: unsafeCSS(`${shadowBaseCss}${cartCss}`),
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-cart-page': InstanceType<typeof CartPage>;
  }
}

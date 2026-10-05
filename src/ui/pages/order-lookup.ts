// Guest order lookup (docs/product-specs/orders.md): order number + email. The answer never
// says which of the two was wrong, so order numbers and emails can't be probed.
import { html, nothing } from '@gyral/core';
import { csrfField } from '../forms/csrf.js';

export interface OrderLookupData {
  readonly csrf: string;
  readonly number: string;
  readonly email: string;
  readonly error?: string;
}

export const orderLookupPage = (d: OrderLookupData) => html`
  <article class="order-page order-lookup" data-region="order-lookup" aria-labelledby="title">
    <header>
      <h1 id="title">Find your order</h1>
      <p>
        Enter the order number from your confirmation email and the email address you used at
        checkout. Have an account? <a href="/account/orders">See your orders</a>.
      </p>
    </header>
    <form method="post" action="/order/lookup" data-component="lookup-form">
      ${csrfField(d.csrf)}
      ${
        d.error === undefined
          ? nothing
          : html`<p
              class="notice"
              data-component="notice"
              data-kind="error"
              role="alert"
              id="lookup-error"
            >
              ${d.error}
            </p>`
      }
      <p>
        <label for="lookup-number">Order number</label>
        <input
          id="lookup-number"
          name="number"
          required
          autocomplete="off"
          spellcheck="false"
          placeholder="GG-20261004-4F7Q"
          value=${d.number}
          aria-describedby=${d.error === undefined ? nothing : 'lookup-error'}
        />
      </p>
      <p>
        <label for="lookup-email">Email</label>
        <input
          id="lookup-email"
          name="email"
          type="email"
          required
          autocomplete="email"
          value=${d.email}
        />
      </p>
      <p><button type="submit">Find order</button></p>
    </form>
  </article>
`;

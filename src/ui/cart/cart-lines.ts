// Cart page lines (docs/product-specs/cart.md). Every control is a small POST form that works
// without JavaScript; with it, the cart page's intents send the same fields to the store.
import { html, nothing, repeat } from '@gyral/core';
import { format } from '../../domain/money.js';
import { csrfField } from '../forms/csrf.js';
import { lineIssueMessage, type CartLine } from './model.js';

export interface LineIntents {
  readonly SetQuantity: string;
  readonly Remove: string;
}

const optionText = (options: Readonly<Record<string, string>>) =>
  Object.entries(options)
    .map(([name, value]) => `${name}: ${value}`)
    .join(' · ');

const idFor = (sku: string) => sku.replace(/[^\w-]/g, '_');

const stepForm = (
  line: CartLine,
  to: number,
  label: string,
  text: string,
  disabled: boolean,
  csrf: string,
  intent: string,
) => html`
  <form method="post" action="/cart/update" data-intent=${intent} class="step">
    ${csrfField(csrf)}
    <input type="hidden" name="sku" value=${line.sku} />
    <input type="hidden" name="quantity" value=${String(to)} />
    <button type="submit" aria-label=${label} ?disabled=${disabled}>${text}</button>
  </form>
`;

function lineTemplate(line: CartLine, csrf: string, i: LineIntents) {
  const id = idFor(line.sku);
  const options = optionText(line.options);
  const max = Math.max(line.maxQuantity, 1);
  return html`
    <li
      class="cart-line ${line.issue === undefined ? '' : 'has-issue'}"
      data-component="cart-line"
      part="line"
    >
      ${
        line.image === undefined
          ? html`<span class="thumb"></span>`
          : html`<img
              class="thumb"
              src=${line.image.url}
              alt=""
              width="80"
              height="80"
              loading="lazy"
            />`
      }
      <div class="details">
        <h3><a href=${line.href}>${line.productName}</a></h3>
        ${options === '' ? nothing : html`<p class="options">${options}</p>`}
        <p class="unit" data-component="price">
          ${
            line.onSale
              ? html`<ins>${format(line.unit)}</ins> <del>${format(line.listPrice)}</del>`
              : format(line.unit)
          }
          <span class="each">each</span>
        </p>
        ${
          line.issue === undefined
            ? nothing
            : html`<p class="issue" id="issue-${id}">${lineIssueMessage(line.issue)}</p>`
        }
      </div>
      <div class="quantity" data-component="quantity" part="quantity">
        ${stepForm(line, line.quantity - 1, `Decrease quantity of ${line.productName}`, '−', line.quantity <= 1, csrf, i.SetQuantity)}
        <form method="post" action="/cart/update" data-intent=${i.SetQuantity} class="set">
          ${csrfField(csrf)}
          <input type="hidden" name="sku" value=${line.sku} />
          <label class="visually-hidden" for="qty-${id}">Quantity of ${line.productName}</label>
          <input
            id="qty-${id}"
            name="quantity"
            type="number"
            inputmode="numeric"
            min="0"
            max=${String(max)}
            value=${String(line.quantity)}
            required
            aria-describedby=${line.issue === undefined ? nothing : `issue-${id}`}
          />
          <button type="submit">Update</button>
        </form>
        ${stepForm(line, line.quantity + 1, `Increase quantity of ${line.productName}`, '+', line.quantity >= line.maxQuantity, csrf, i.SetQuantity)}
      </div>
      <p class="line-total" data-component="price" part="line-total">${format(line.lineTotal)}</p>
      <form method="post" action="/cart/remove" data-intent=${i.Remove} class="remove">
        ${csrfField(csrf)}
        <input type="hidden" name="sku" value=${line.sku} />
        <button type="submit" aria-label="Remove ${line.productName}">Remove</button>
      </form>
    </li>
  `;
}

export const cartLines = (lines: readonly CartLine[], csrf: string, i: LineIntents) => html`
  <ul class="cart-lines" part="lines">
    ${repeat(
      lines,
      (l) => l.sku,
      (l) => lineTemplate(l, csrf, i),
    )}
  </ul>
`;

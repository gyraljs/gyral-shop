import { define, fieldErrors, form, html, nothing, send } from '@gyral/core';
import { maxQuantity } from '../../domain/inventory.js';
import { format, usd } from '../../domain/money.js';
import {
  choiceReason,
  choiceState,
  choose,
  defaultSelection,
  optionAxes,
  resolveVariant,
  variantAvailability,
  variantLabel,
  type Selection,
} from '../../domain/variants.js';
import { AddForm } from '../cart/schemas.js';
import { cartStore } from '../cart/store.js';
import { csrfField } from '../forms/csrf.js';
import { buyBoxCss } from '../styles/buy-box.js';

/** One SKU (matches services/product.ts VariantView). */
export interface BuyBoxVariant {
  readonly sku: string;
  readonly options: Readonly<Record<string, string>>;
  readonly priceCents: number;
  readonly salePriceCents: number | null;
  readonly stock: number;
}

export interface BuyBoxProps {
  readonly variants: readonly BuyBoxVariant[];
  /** Where the form posts. The cart epic owns the endpoint. */
  readonly action: string;
  readonly csrf?: string;
}

export interface BuyBoxState {
  readonly selection: Selection;
  /** False on the server and during hydration: the no-JS SKU list. True once interactive. */
  readonly enhanced: boolean;
  /** A client-side validation error for the add-to-cart form. */
  readonly formError: string | undefined;
}

export type BuyBoxMsg =
  | { readonly _tag: 'Choose'; readonly axis: string; readonly value: string }
  | { readonly _tag: 'Add'; readonly sku: string; readonly quantity: number };

export const ADD_TO_CART_PATH = '/cart/add';

const priceView = (v: BuyBoxVariant) =>
  v.salePriceCents === null || v.salePriceCents >= v.priceCents
    ? html`<p class="price">${format(usd(v.priceCents))}</p>`
    : html`<p class="price sale">
        <ins><span class="visually-hidden">Sale price </span>${format(usd(v.salePriceCents))}</ins>
        <del><span class="visually-hidden">Was </span>${format(usd(v.priceCents))}</del>
      </p>`;

const stockText = (v: BuyBoxVariant): string => {
  const state = variantAvailability(v);
  switch (state._tag) {
    case 'InStock':
      return 'In stock';
    case 'LowStock':
      return `Only ${String(state.left)} left`;
    case 'OutOfStock':
      return 'Out of stock';
  }
};

const unitCents = (v: BuyBoxVariant) =>
  v.salePriceCents !== null && v.salePriceCents < v.priceCents ? v.salePriceCents : v.priceCents;

/** Without JavaScript: every SKU as one radio list (sold-out SKUs disabled). */
const skuList = (variants: readonly BuyBoxVariant[], selected: string | undefined) => html`
  <fieldset class="choices">
    <legend>Choose an option</legend>
    ${variants.map(
      (v) => html`
        <label class="sku">
          <input
            type="radio"
            name="sku"
            value=${v.sku}
            required
            ?checked=${v.sku === selected}
            ?disabled=${v.stock <= 0}
          />
          <span>${variantLabel(v)}</span>
          <span class="meta">${format(usd(unitCents(v)))} · ${stockText(v)}</span>
        </label>
      `,
    )}
  </fieldset>
`;

/** With JavaScript: one radio group per option axis; impossible combinations disabled. */
const axisPickers = (variants: readonly BuyBoxVariant[], selection: Selection, intent: string) =>
  optionAxes(variants).map(
    (axis) => html`
      <fieldset class="choices axis">
        <legend>${axis.name}: <strong>${selection[axis.name] ?? nothing}</strong></legend>
        ${axis.values.map((value) => {
          const state = choiceState(variants, selection, axis.name, value);
          const reason = choiceReason(state, axis.name, selection);
          const id = `opt-${axis.name}-${value}`.replace(/[^\w-]/g, '_');
          return html`
            <label class="option">
              <input
                type="radio"
                name=${`option-${axis.name}`}
                value=${value}
                data-axis=${axis.name}
                data-intent=${intent}
                ?checked=${selection[axis.name] === value}
                ?disabled=${state._tag !== 'Available' && selection[axis.name] !== value}
                aria-describedby=${reason === '' ? nothing : id}
              />
              <span>${value}</span>
              ${reason === '' ? nothing : html`<small id=${id}>${reason}</small>`}
            </label>
          `;
        })}
      </fieldset>
    `,
  );

/**
 * Price, availability, options and the add-to-cart form. The form posts the SKU and quantity
 * with or without JavaScript; with it, options are chosen per axis instead of from a SKU list.
 */
export const BuyBox = define<BuyBoxState, BuyBoxMsg, BuyBoxProps>('shop-buy-box', {
  props: {
    variants: { attribute: false, required: true },
    action: { type: String, default: ADD_TO_CART_PATH },
    csrf: { type: String },
  },
  stores: [cartStore],
  // The server and the first client render show the no-JS SKU list (hydration must match);
  // Gyral's `Hydrated` message then switches to per-option choices (Gyral ADR 0012).
  init: (props) => ({
    selection: defaultSelection(props.variants),
    enhanced: false,
    formError: undefined,
  }),
  intent: {
    Choose: ({ target, value }) => {
      const axis = target.getAttribute('data-axis');
      return axis === null || value === undefined ? undefined : { _tag: 'Choose', axis, value };
    },
    // With JavaScript the form adds through the shared cart store (no navigation); without it,
    // the browser posts the same fields to /cart/add.
    Add: form(AddForm, (d) => ({ _tag: 'Add', sku: d.sku, quantity: d.quantity })),
  },
  update: {
    Hydrated: (s) => ({ ...s, enhanced: true }),
    Choose: (s, m, { props }) => ({
      ...s,
      selection: choose(props.variants, s.selection, m.axis, m.value),
    }),
    Add: (s, m) => [{ ...s, formError: undefined }, [send(cartStore, m)]],
    IntentRejected: (s, m) => ({
      ...s,
      formError: Object.values(fieldErrors(m.issues))[0]?.[0] ?? 'Check your choice and quantity.',
    }),
  },
  view: (s, i, { props, read }) => {
    const { notice, inFlight } = read(cartStore);
    const added = notice?.op === 'add' ? notice : undefined;
    const { variants } = props;
    const current = resolveVariant(variants, s.selection) ?? variants[0];
    if (current === undefined) return html`<p>This product is not available.</p>`;
    const max = maxQuantity(current.stock);
    const multiple = variants.length > 1;
    return html`
      ${priceView(current)}
      <p class="stock ${current.stock <= 0 ? 'out' : ''}" role="status">
        ${multiple ? html`<span class="label">${variantLabel(current)}: </span>` : nothing}${stockText(
          current,
        )}
      </p>
      <form method="post" action=${props.action} data-intent=${i.Add}>
        ${props.csrf === undefined || props.csrf === '' ? nothing : csrfField(props.csrf)}
        ${
          !multiple
            ? html`<input type="hidden" name="sku" value=${current.sku} />`
            : s.enhanced
              ? html`${axisPickers(variants, s.selection, i.Choose)}
                  <input type="hidden" name="sku" value=${current.sku} />`
              : skuList(variants, current.sku)
        }
        <p class="quantity">
          <label for="quantity">Quantity</label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            inputmode="numeric"
            min="1"
            max=${Math.max(1, s.enhanced ? max : 10)}
            value="1"
            required
            ?disabled=${s.enhanced && max === 0}
          />
        </p>
        <button type="submit" ?disabled=${s.enhanced && max === 0}>
          ${s.enhanced && max === 0 ? 'Out of stock' : inFlight > 0 ? 'Adding…' : 'Add to cart'}
        </button>
      </form>
      <p
        data-component="cart-notice"
        part="added"
        class="added ${s.formError === undefined ? (added?.kind ?? '') : 'error'}"
        role="status"
      >
        ${
          s.formError ?? added?.message ?? nothing
        }${added?.kind === 'success' && s.formError === undefined ? html` <a href="/cart">View cart</a>` : nothing}
      </p>
    `;
  },
  styles: buyBoxCss,
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-buy-box': InstanceType<typeof BuyBox>;
  }
}

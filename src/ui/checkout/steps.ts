// The checkout steps' markup: a summary with an Edit link when done, the form when open, a
// heading only when locked. The server renders the same markup, so the no-JS flow is the same
// page reloaded after each step.
import { html, invalid, nothing, type IntentNames } from '@gyral/core';
import { addressLines, cardLabel, type CheckoutStep } from '../../domain/checkout.js';
import { format } from '../../domain/money.js';
import { STATE_CODES } from '../../domain/tax.js';
import { csrfField } from '../forms/csrf.js';
import type { CheckoutMsg, CheckoutState } from './checkout-page.js';
import type { CheckoutClient } from './model.js';

type I = IntentNames<CheckoutMsg>;

export const STEP_TITLES: Readonly<Record<CheckoutStep, string>> = {
  contact: 'Contact',
  address: 'Shipping address',
  shipping: 'Shipping method',
  payment: 'Payment',
  review: 'Review and place order',
};

const value = (s: CheckoutState, field: string, fallback = ''): string => {
  const v = s.values[field];
  return typeof v === 'string' ? v : fallback;
};

const errorsOf = (s: CheckoutState, intent: string, field: string) => s.errors[intent]?.[field];

/**
 * A labelled input with its error message. `value: undefined` leaves the value unbound (card
 * fields): form state is live (Gyral view/02-bindings.md), so a bound '' would clear what the
 * customer typed on every render, e.g. while the step is being sent.
 */
function field(
  s: CheckoutState,
  intent: string,
  f: {
    readonly name: string;
    readonly label: string;
    readonly value: string | undefined;
    readonly type?: string;
    readonly autocomplete?: string;
    readonly required?: boolean;
    readonly inputmode?: string;
    readonly placeholder?: string;
  },
) {
  const errors = errorsOf(s, intent, f.name);
  const id = `${intent}-${f.name}`;
  const input =
    f.value === undefined
      ? html`<input
          id=${id}
          name=${f.name}
          type=${f.type ?? 'text'}
          autocomplete=${f.autocomplete}
          inputmode=${f.inputmode}
          placeholder=${f.placeholder}
          ?required=${f.required === true}
          aria-describedby=${`${id}-error`}
          ${invalid(errors)}
        />`
      : html`<input
          id=${id}
          name=${f.name}
          type=${f.type ?? 'text'}
          autocomplete=${f.autocomplete}
          inputmode=${f.inputmode}
          placeholder=${f.placeholder}
          ?required=${f.required === true}
          value=${f.value}
          aria-describedby=${`${id}-error`}
          ${invalid(errors)}
        />`;
  return html`<p class="field">
    <label for=${id}
      >${f.label}${f.required === true ? nothing : html` <small>(optional)</small>`}</label
    >
    ${input}
    <span id=${`${id}-error`} class="error">${errors?.join(' ')}</span>
  </p>`;
}

const formError = (s: CheckoutState, intent: string) => {
  const message = s.errors[intent]?.['']?.join(' ');
  return message === undefined ? nothing : html`<p class="error" role="alert">${message}</p>`;
};

const submit = (s: CheckoutState, label: string) =>
  html`<button class="primary" ?disabled=${s.pending !== undefined}>${label}</button>`;

function contactForm(s: CheckoutState, view: CheckoutClient, i: I, csrf: string) {
  return html`<form data-intent=${i.Contact} action="/checkout/contact" method="post" novalidate>
    ${csrfField(csrf)}
    ${
      view.memberEmail === undefined
        ? nothing
        : html`<p class="hint">Signed in as ${view.memberEmail}.</p>`
    }
    ${field(s, 'Contact', {
      name: 'email',
      label: 'Email for order updates',
      type: 'email',
      autocomplete: 'email',
      required: true,
      value: value(s, 'email', view.email ?? view.memberEmail ?? ''),
    })}
    ${formError(s, 'Contact')} ${submit(s, 'Continue to shipping address')}
  </form>`;
}

function addressForm(s: CheckoutState, view: CheckoutClient, i: I, csrf: string) {
  const a = view.address;
  const v = (name: string, current: string | undefined) => value(s, name, current ?? '');
  const chosen = value(
    s,
    'addressId',
    view.savedAddresses.find((x) => x.isDefault)?.id.toString() ?? 'new',
  );
  const state = v('state', a?.state);
  return html`<form
    data-intent=${i.Address}
    data-component="address-form"
    action="/checkout/address"
    method="post"
    novalidate
  >
    ${csrfField(csrf)}
    ${
      view.savedAddresses.length === 0
        ? html`<input type="hidden" name="addressId" value="new" />`
        : html`<fieldset class="saved-addresses">
            <legend>Ship to</legend>
            ${view.savedAddresses.map(
              (saved) =>
                html`<label class="choice">
                  <input
                    type="radio"
                    name="addressId"
                    value=${String(saved.id)}
                    ?checked=${chosen === String(saved.id)}
                  />
                  <span>${addressLines(saved).join(', ')}</span>
                </label>`,
            )}
            <label class="choice">
              <input type="radio" name="addressId" value="new" ?checked=${chosen === 'new'} />
              <span>A new address (below)</span>
            </label>
          </fieldset>`
    }
    <fieldset class="new-address">
      <legend>${view.savedAddresses.length === 0 ? 'Address' : 'New address'}</legend>
      ${field(s, 'Address', { name: 'name', label: 'Full name', autocomplete: 'shipping name', value: v('name', a?.name), required: true })}
      ${field(s, 'Address', { name: 'line1', label: 'Street address', autocomplete: 'shipping address-line1', value: v('line1', a?.line1), required: true })}
      ${field(s, 'Address', { name: 'line2', label: 'Apartment, suite, etc.', autocomplete: 'shipping address-line2', value: v('line2', a?.line2) })}
      ${field(s, 'Address', { name: 'city', label: 'City', autocomplete: 'shipping address-level2', value: v('city', a?.city), required: true })}
      <p class="field">
        <label for="Address-state">State</label>
        <select id="Address-state" name="state" autocomplete="shipping address-level1">
          <option value="" ?selected=${state === ''}>Choose…</option>
          ${STATE_CODES.map(
            (code) => html`<option value=${code} ?selected=${state === code}>${code}</option>`,
          )}
        </select>
        <span id="Address-state-error" class="error"
          >${errorsOf(s, 'Address', 'state')?.join(' ') ?? nothing}</span
        >
      </p>
      ${field(s, 'Address', { name: 'postalCode', label: 'ZIP code', autocomplete: 'shipping postal-code', inputmode: 'numeric', value: v('postalCode', a?.postalCode), required: true })}
      ${field(s, 'Address', { name: 'phone', label: 'Phone', type: 'tel', autocomplete: 'shipping tel', value: v('phone', a?.phone) })}
      ${
        view.memberEmail === undefined
          ? nothing
          : html`<label class="choice"
              ><input type="checkbox" name="save" />
              <span>Save this address to my account</span></label
            >`
      }
    </fieldset>
    ${formError(s, 'Address')} ${submit(s, 'Continue to shipping method')}
  </form>`;
}

const days = (d: { readonly min: number; readonly max: number }) =>
  d.min === d.max
    ? `${String(d.min)} business day`
    : `${String(d.min)}–${String(d.max)} business days`;

function shippingForm(s: CheckoutState, view: CheckoutClient, i: I, csrf: string) {
  const chosen = value(s, 'method', view.shippingMethod ?? 'standard');
  return html`<form data-intent=${i.Shipping} action="/checkout/shipping" method="post">
    ${csrfField(csrf)}
    <fieldset>
      <legend>Delivery speed</legend>
      ${view.shippingOptions.map(
        (o) =>
          html`<label class="choice" data-component="shipping-option">
            <input type="radio" name="method" value=${o.method} ?checked=${chosen === o.method} />
            <span class="label">${o.label}</span>
            <span class="estimate">${days(o.days)}</span>
            <span class="amount">${o.price.cents === 0 ? 'Free' : format(o.price)}</span>
          </label>`,
      )}
    </fieldset>
    ${formError(s, 'Shipping')} ${submit(s, 'Continue to payment')}
  </form>`;
}

function paymentForm(s: CheckoutState, i: I, csrf: string) {
  return html`<form
    data-intent=${i.Payment}
    data-component="card-form"
    action="/checkout/payment"
    method="post"
    novalidate
  >
    ${csrfField(csrf)}
    <p class="hint">
      This store is a demo: use the test card 4242 4242 4242 4242, any future date and any 3 digits.
    </p>
    ${field(s, 'Payment', { name: 'number', label: 'Card number', autocomplete: 'cc-number', inputmode: 'numeric', required: true, value: undefined })}
    <div class="row">
      ${field(s, 'Payment', { name: 'expiry', label: 'Expiry (MM/YY)', autocomplete: 'cc-exp', placeholder: 'MM/YY', required: true, value: undefined })}
      ${field(s, 'Payment', { name: 'cvc', label: 'Security code', autocomplete: 'cc-csc', inputmode: 'numeric', required: true, value: undefined })}
    </div>
    ${formError(s, 'Payment')} ${submit(s, 'Continue to review')}
  </form>`;
}

function reviewForm(s: CheckoutState, view: CheckoutClient, i: I, csrf: string) {
  const errors = errorsOf(s, 'PlaceOrder', 'terms');
  return html`<form
    action="/checkout/place"
    method="post"
    class="place-order"
    data-component="place-order"
    data-intent=${i.PlaceOrder}
  >
    ${csrfField(csrf)}
    <input type="hidden" name="key" value=${view.placeKey ?? ''} />
    <input type="hidden" name="expectedTotal" value=${String(view.totals.total.cents)} />
    <p>Total to pay: <strong data-component="price">${format(view.totals.total)}</strong></p>
    <label class="choice"
      ><input
        type="checkbox"
        name="terms"
        required
        aria-describedby="PlaceOrder-terms-error"
        ${invalid(errors)}
      />
      <span>I accept the <a href="/terms">terms of sale</a>.</span></label
    >
    <span id="PlaceOrder-terms-error" class="error">${errors?.join(' ') ?? nothing}</span>
    ${formError(s, 'PlaceOrder')} ${submit(s, 'Place order')}
  </form>`;
}

/** What a done step shows instead of its form. */
function stepSummary(step: CheckoutStep, view: CheckoutClient) {
  switch (step) {
    case 'contact':
      return html`<p>${view.email ?? nothing}</p>`;
    case 'address':
      return view.address === undefined
        ? nothing
        : html`<address>${addressLines(view.address).map((l) => html`${l}<br />`)}</address>`;
    case 'shipping': {
      const o = view.shippingOptions.find((x) => x.method === view.shippingMethod);
      return o === undefined ? nothing : html`<p>${o.label}, ${days(o.days)}</p>`;
    }
    case 'payment':
      return view.card === undefined ? nothing : html`<p>${cardLabel(view.card)}</p>`;
    case 'review':
      return nothing;
  }
}

export function stepBody(
  step: CheckoutStep,
  status: 'done' | 'open' | 'locked',
  s: CheckoutState,
  view: CheckoutClient,
  i: I,
  csrf: string,
) {
  if (status === 'locked') return html`<p class="locked">Complete the steps above first.</p>`;
  if (status === 'done') {
    return html`<div class="step-summary" data-component="step-summary">
      ${stepSummary(step, view)}
      <a
        href=${`/checkout?edit=${step}`}
        data-intent=${i.Edit}
        data-step=${step}
        data-component="step-edit"
        >Edit <span class="visually-hidden">${STEP_TITLES[step]}</span></a
      >
    </div>`;
  }
  switch (step) {
    case 'contact':
      return contactForm(s, view, i, csrf);
    case 'address':
      return addressForm(s, view, i, csrf);
    case 'shipping':
      return shippingForm(s, view, i, csrf);
    case 'payment':
      return paymentForm(s, i, csrf);
    case 'review':
      return reviewForm(s, view, i, csrf);
  }
}

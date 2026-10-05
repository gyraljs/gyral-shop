// Checkout (docs/product-specs/checkout.md). Server-rendered from the checkout view; each step is
// a POST form that works without JavaScript (the page reloads with the next step open). With
// JavaScript, the same forms are intents: the browser validates with the shared schema, then
// submitForm posts to the same route, which answers with the new view (or the same
// IntentRejected the no-JS path renders). The server always has the last word.
//
// Shadow DOM, not light DOM (ADR 0006 rule 5 exception): Gyral's light-DOM mode re-renders at
// hydration, which would throw away anything typed into these forms before the script loads.
import {
  define,
  fieldErrors,
  form,
  html,
  nothing,
  redirectedTo,
  unsafeCSS,
  type FormFields,
  type IntentRejected,
} from '@gyral/core';
import { submitForm } from '@gyral/http';
import { isCheckoutStep, type CheckoutStep } from '../../domain/checkout.js';
import { goTo } from '../drivers/location.js';
import { CSRF_META } from '../forms/csrf.js';
import { checkoutCss } from '../styles/checkout.js';
import { shadowBaseCss } from '../styles/filters.js';
import { parseCheckout, type CheckoutClient } from './model.js';
import { AddressForm, ContactForm, PaymentForm, SECRET_FIELDS, ShippingForm } from './schemas.js';
import { STEP_TITLES, stepBody } from './steps.js';
import { orderSummary } from './summary.js';

/** Steps the customer submits (review places the order with a plain form post). */
type FormStep = 'Contact' | 'Address' | 'Shipping' | 'Payment';

/** One message per step, so each step's form() intent produces its own variant. */
type StepMsg = {
  readonly [K in FormStep]: { readonly _tag: K; readonly form: FormData };
}[FormStep];

export type CheckoutMsg =
  | StepMsg
  | { readonly _tag: 'Saved'; readonly view: CheckoutClient }
  | { readonly _tag: 'Redirect'; readonly location: string }
  | { readonly _tag: 'Failed' }
  | { readonly _tag: 'Edit'; readonly step: CheckoutStep };

export interface CheckoutProps {
  /** Set by the server render; the browser restores it from the hydration seed. */
  readonly view?: CheckoutClient;
  /** For the no-JS forms (the JS path reads the page's <meta> token). */
  readonly csrf?: string;
}

export interface CheckoutState {
  readonly view: CheckoutClient | undefined;
  readonly open: CheckoutStep;
  /** Field errors per step intent ('' is the whole form). */
  readonly errors: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
  /** Text to re-fill after a rejection. Never card fields: state is serialized into the page. */
  readonly values: FormFields;
  readonly pending: FormStep | undefined;
  /** A status message for screen readers after a step is saved. */
  readonly status: string;
}

const URLS: Readonly<Record<FormStep, string>> = {
  Contact: '/checkout/contact',
  Address: '/checkout/address',
  Shipping: '/checkout/shipping',
  Payment: '/checkout/payment',
};

const refill = (values: FormFields = {}): FormFields =>
  Object.fromEntries(Object.entries(values).filter(([key]) => !SECRET_FIELDS.has(key)));

/** Posts a step; the server answers with the new view, a redirect, or a 422 rejection. */
function post(s: CheckoutState, step: FormStep, data: FormData) {
  const errors = Object.fromEntries(Object.entries(s.errors).filter(([intent]) => intent !== step));
  return [
    { ...s, errors, pending: step, status: '' },
    [
      submitForm<CheckoutMsg, CheckoutMsg>(URLS[step], data, {
        csrf: { meta: CSRF_META },
        onSuccess: (body) => {
          const location = redirectedTo(body);
          if (location !== undefined) return { _tag: 'Redirect', location };
          const view = parseCheckout(body);
          return view === undefined ? { _tag: 'Failed' } : { _tag: 'Saved', view };
        },
        onFailure: () => ({ _tag: 'Failed' }),
      }),
    ],
  ] as const;
}

const rejected = (s: CheckoutState, m: IntentRejected): CheckoutState => ({
  ...s,
  errors: { ...s.errors, [m.intent]: fieldErrors(m.issues) },
  values: m.values === undefined ? s.values : refill(m.values),
  pending: undefined,
});

const toForm =
  <K extends FormStep>(step: K) =>
  (_data: unknown, raw: FormData): { readonly _tag: K; readonly form: FormData } => ({
    _tag: step,
    form: raw,
  });

export const Checkout = define<CheckoutState, CheckoutMsg, CheckoutProps>('shop-checkout', {
  props: { view: { attribute: false }, csrf: { type: String } },
  init: (props) => ({
    view: props.view,
    open: props.view?.open ?? 'contact',
    errors: {},
    values: {},
    pending: undefined,
    status: '',
  }),
  intent: {
    Contact: form(ContactForm, toForm('Contact')),
    Address: form(AddressForm, toForm('Address')),
    Shipping: form(ShippingForm, toForm('Shipping')),
    Payment: form(PaymentForm, toForm('Payment')),
    // Edit links work as plain links without JS; with it, the step opens in place.
    Edit: ({ target, event }) => {
      const step = target.getAttribute('data-step') ?? '';
      if (!isCheckoutStep(step)) return undefined;
      event.preventDefault();
      return { _tag: 'Edit', step };
    },
  },
  update: {
    Contact: (s, m) => post(s, 'Contact', m.form),
    Address: (s, m) => post(s, 'Address', m.form),
    Shipping: (s, m) => post(s, 'Shipping', m.form),
    Payment: (s, m) => post(s, 'Payment', m.form),
    Saved: (s, m) => ({
      ...s,
      view: m.view,
      open: m.view.open,
      values: {},
      pending: undefined,
      status: `Saved. Next: ${STEP_TITLES[m.view.open]}.`,
    }),
    Redirect: (s, m) => [{ ...s, pending: undefined }, [goTo(m.location)]],
    Failed: (s) => ({
      ...s,
      errors: {
        ...s.errors,
        [s.pending ?? 'Contact']: { '': ['Something went wrong. Please try again.'] },
      },
      pending: undefined,
    }),
    Edit: (s, m) => ({ ...s, open: m.step, status: '' }),
    IntentRejected: rejected,
  },
  view: (s, i, { props }) => {
    const view = s.view;
    if (view === undefined) return html`<p>Loading checkout…</p>`;
    const csrf = props.csrf ?? '';
    // Statuses come from the server; a client-side Edit only moves which saved step is open.
    const statusOf = (step: CheckoutStep) => {
      if (step === s.open) return 'open';
      const server = view.steps.find((x) => x.step === step)?.status ?? 'locked';
      // The server's open step has no saved data yet, so while another is edited it waits.
      return server === 'open' ? 'locked' : server;
    };
    return html`<h1>Checkout</h1>
      <p class="visually-hidden" role="status">
        ${
          // nothing, not '': Lit hydrates an empty text part without a text node, and its first
          // update then writes into the closing marker comment (see the bead in Gyral).
          s.status === '' ? nothing : s.status
        }
      </p>
      <div class="layout">
        <ol class="steps">
          ${view.steps.map(({ step }, index) => {
            const status = statusOf(step);
            return html`<li
              class="step ${status}"
              data-component="checkout-step"
              data-step=${step}
              part="step"
              aria-current=${status === 'open' ? 'step' : 'false'}
            >
              <section aria-labelledby=${`${step}-heading`}>
                <h2 id=${`${step}-heading`}>
                  <span class="number">${index + 1}.</span> ${STEP_TITLES[step]}
                </h2>
                ${stepBody(step, status, s, view, i, csrf)}
              </section>
            </li>`;
          })}
        </ol>
        ${orderSummary(view)}
      </div>`;
  },
  styles: unsafeCSS(`${shadowBaseCss}${checkoutCss}`),
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-checkout': InstanceType<typeof Checkout>;
  }
}

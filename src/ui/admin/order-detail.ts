// <shop-admin-order>: one order with its lines, totals, address, payment and timeline, and the
// actions the state machine allows now: ship, mark delivered, cancel and refund, or refund an
// amount (docs/product-specs/admin.md, "Orders").
import {
  define,
  fieldErrors,
  form,
  html,
  nothing,
  prop,
  type FormFields,
  type IntentRejected,
} from '@gyral/core';
import { get, submitForm, type HttpError } from '@gyral/http';
import * as v from 'valibot';
import {
  AdminOrderSchema,
  dollarsText,
  TransitionedSchema,
  type AdminOrder,
  type OrderAction,
} from '../../domain/admin.js';
import { format, usd } from '../../domain/money.js';
import { statusBadge } from '../orders/parts.js';
import { adminDrivers } from './drivers.js';
import { draftOf, formError, textField, type Errors } from './fields.js';
import { dateTime, loadError, statusLabel } from './format.js';
import { TransitionForm } from './schemas.js';

export interface OrderProps {
  readonly number: string;
}

export interface OrderState {
  readonly number: string;
  readonly order: AdminOrder | null;
  readonly error: string | null;
  readonly notice: string | null;
  readonly errors: Errors;
  readonly pending: OrderAction | null;
  /** What the refund form last sent, until the order reloads (fields.ts `Drafts`). */
  readonly draft: FormFields | undefined;
}

export type OrderMsg =
  | { readonly _tag: 'Transition'; readonly action: OrderAction; readonly form: FormData }
  | { readonly _tag: 'Loaded'; readonly order: AdminOrder }
  | { readonly _tag: 'Transitioned'; readonly notice: string }
  | { readonly _tag: 'Failed'; readonly error: HttpError };

const load = (number: string) =>
  get(`/api/admin/orders/${encodeURIComponent(number)}`, {
    schema: AdminOrderSchema,
    onSuccess: (order): OrderMsg => ({ _tag: 'Loaded', order }),
    onFailure: (error): OrderMsg => ({ _tag: 'Failed', error }),
    key: 'admin-order',
    concurrency: 'switch',
  });

const Conflict = v.object({ error: v.literal('conflict'), message: v.string() });

/** A 409 carries the reason (the order changed, the provider refused); show it as is. */
function failure(error: HttpError): string {
  if (error._tag === 'HttpStatusError' && error.status === 409) {
    const parsed = v.safeParse(Conflict, error.body);
    if (parsed.success) return parsed.output.message;
  }
  return loadError(error);
}

const money = (cents: number) => format(usd(cents));

const LABELS: Readonly<Record<Exclude<OrderAction, 'Refund'>, string>> = {
  Fulfil: 'Mark as shipped',
  Deliver: 'Mark as delivered',
  Cancel: 'Cancel and refund in full',
};

function actions(s: OrderState, o: AdminOrder, i: { readonly Transition: 'Transition' }) {
  const simple = o.actions.filter((a): a is Exclude<OrderAction, 'Refund'> => a !== 'Refund');
  return html`<section aria-labelledby="actions-heading" data-region="admin-order-actions">
    <h2 id="actions-heading">Actions</h2>
    ${formError(s.errors)}
    ${o.actions.length === 0 ? html`<p data-component="empty">No further changes are possible.</p>` : nothing}
    <div class="admin-actions">
      ${simple.map(
        (action) =>
          html`<form data-intent=${i.Transition} data-component="order-action">
            <input type="hidden" name="action" value=${action} />
            <button
              type="submit"
              data-variant=${action === 'Cancel' ? 'danger' : nothing}
              ?disabled=${s.pending !== null}
            >
              ${LABELS[action]}
            </button>
          </form>`,
      )}
    </div>
    ${
      o.actions.includes('Refund')
        ? html`<form class="admin-form" data-intent=${i.Transition} data-component="refund-form">
            <input type="hidden" name="action" value="Refund" />
            ${textField({
              form: 'refund',
              name: 'amount',
              label: 'Refund amount (USD)',
              hint: `Up to ${money(o.refundableCents)} can still be refunded.`,
              errors: s.errors,
              draft: s.draft,
              value: dollarsText(o.refundableCents),
              inputmode: 'decimal',
              required: true,
            })}
            <div class="admin-actions">
              <button type="submit" data-variant="quiet" ?disabled=${s.pending !== null}>
                Refund
              </button>
            </div>
          </form>`
        : nothing
    }
  </section>`;
}

function details(o: AdminOrder) {
  const row = (label: string, cents: number, negative = false) =>
    html`<div class="row">
      <dt>${label}</dt>
      <dd>${negative ? `−${money(cents)}` : money(cents)}</dd>
    </div>`;
  return html`<section aria-labelledby="lines-heading" data-region="order-lines">
      <h2 id="lines-heading">Items</h2>
      <table class="admin-table" data-component="admin-table">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" class="num">Qty</th>
            <th scope="col" class="num">Price</th>
            <th scope="col" class="num">Total</th>
          </tr>
        </thead>
        <tbody>
          ${o.lines.map(
            (l) =>
              html`<tr data-component="order-line">
                <td>${l.name}${l.variant === '' ? nothing : html`<small>${l.variant}</small>`}</td>
                <td class="num">${l.quantity}</td>
                <td class="num">${money(l.unitCents)}</td>
                <td class="num">${money(l.totalCents)}</td>
              </tr>`,
          )}
        </tbody>
      </table>
      <dl class="totals" data-region="order-totals">
        ${row('Subtotal', o.totals.subtotal)}
        ${o.totals.discount === 0 ? nothing : row(`Discount${o.promoCode === null ? '' : ` (${o.promoCode})`}`, o.totals.discount, true)}
        ${row('Shipping', o.totals.shipping)} ${row('Tax', o.totals.tax)}
        ${row('Total', o.totals.total)}
        ${o.refundedCents === 0 ? nothing : row('Refunded', o.refundedCents, true)}
      </dl>
    </section>
    <section aria-labelledby="customer-heading" data-region="delivery">
      <h2 id="customer-heading">Customer and delivery</h2>
      <p><a href=${`mailto:${o.email}`}>${o.email}</a></p>
      <address>
        ${o.address.name}<br />${o.address.line1}<br />
        ${o.address.line2 === undefined || o.address.line2 === '' ? nothing : html`${o.address.line2}<br />`}
        ${o.address.city}, ${o.address.state} ${o.address.postalCode}
      </address>
      <p>
        ${o.shipping}${o.payment === null ? nothing : html` · Paid with ${o.payment.brand} •••• ${o.payment.last4}`}
      </p>
    </section>
    <section aria-labelledby="timeline-heading" data-region="order-timeline">
      <h2 id="timeline-heading">Timeline</h2>
      <ol class="timeline">
        ${o.events.map(
          (e) =>
            html`<li data-component="order-event">
              <time datetime=${e.at}>${dateTime.format(new Date(e.at))}</time>
              <strong>${statusLabel(e.status)}</strong
              >${e.note === null ? nothing : html` — ${e.note}`}
            </li>`,
        )}
      </ol>
    </section>`;
}

export const AdminOrderDetail = define<OrderState, OrderMsg, OrderProps>('shop-admin-order', {
  shadow: false,
  props: { number: prop.string({ required: true }) },
  init: (props) => [
    {
      number: props.number,
      order: null,
      error: null,
      notice: null,
      errors: {},
      pending: null,
      draft: undefined,
    },
    [load(props.number)],
  ],
  intent: {
    Transition: form(TransitionForm, (data, raw) => ({
      _tag: 'Transition',
      action: data.action,
      form: raw,
    })),
  },
  update: {
    Transition: (s, m) => [
      { ...s, pending: m.action, errors: {}, notice: null, error: null, draft: draftOf(m.form) },
      [
        submitForm(`/api/admin/orders/${encodeURIComponent(s.number)}/transition`, m.form, {
          onSuccess: (body): OrderMsg | undefined => {
            const done = v.safeParse(TransitionedSchema, body);
            return done.success ? { _tag: 'Transitioned', notice: done.output.notice } : undefined;
          },
          onFailure: (error): OrderMsg => ({ _tag: 'Failed', error }),
          key: 'admin-order-action',
        }),
      ],
    ],
    Loaded: (s, m) => ({ ...s, order: m.order, draft: undefined }),
    Transitioned: (s, m) => [{ ...s, pending: null, notice: m.notice }, [load(s.number)]],
    // A failed action reloads too: the order may have changed underneath.
    Failed: (s, m) =>
      s.pending === null
        ? { ...s, error: loadError(m.error) }
        : [{ ...s, pending: null, error: failure(m.error) }, [load(s.number)]],
    IntentRejected: (s, m: IntentRejected) => ({
      ...s,
      pending: null,
      errors: fieldErrors(m.issues),
      draft: m.values ?? s.draft,
    }),
  },
  drivers: adminDrivers,
  view: (s, i) =>
    html`<section class="admin-page" data-region="admin-order">
      <p class="crumbs"><a href="/admin/orders">All orders</a></p>
      <h1 tabindex="-1">
        Order <code>${s.number}</code> ${s.order === null ? nothing : statusBadge(s.order.status)}
      </h1>
      ${s.order === null ? nothing : html`<p>Placed <time datetime=${s.order.placedAt}>${dateTime.format(new Date(s.order.placedAt))}</time></p>`}
      ${s.error === null ? nothing : html`<p role="alert" data-component="notice" data-kind="error">${s.error}</p>`}
      <p role="status" data-component="notice" data-kind="success" ?hidden=${s.notice === null}>
        ${s.notice ?? nothing}
      </p>
      ${
        s.order === null
          ? s.error === null
            ? html`<p role="status" data-component="loading">Loading…</p>`
            : nothing
          : html`${actions(s, s.order, i)} ${details(s.order)}`
      }
    </section>`,
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-admin-order': InstanceType<typeof AdminOrderDetail>;
  }
}

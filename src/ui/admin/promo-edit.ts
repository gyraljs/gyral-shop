// <shop-admin-promo>: create, edit or delete a promo code (docs/product-specs/admin.md, ADR 0003).
// The form validates in the browser with the shared schema (form()), then posts with
// submitForm; the API answers JSON or a 422 IntentRejected that lands in the same error state.
import {
  define,
  fieldErrors,
  form,
  html,
  nothing,
  type IntentRejected,
  type Next,
} from '@gyral/core';
import { get, submitForm, type HttpError } from '@gyral/http';
import { navigate } from '@gyral/router';
import * as v from 'valibot';
import { dollarsText } from '../../domain/admin.js';
import { PromoEditSchema, promoAmountText, type PromoEdit } from '../../domain/admin-manage.js';
import { adminDrivers } from './drivers.js';
import { formError, selectField, textField, type Errors } from './fields.js';
import { loadError } from './format.js';
import { PromoDeleteForm, PromoForm } from './manage-schemas.js';

export interface PromoEditProps {
  /** The promo to edit; 0 for a new one. */
  readonly promoId: number;
}

export interface PromoEditState {
  readonly id: number;
  readonly edit: PromoEdit | null;
  readonly error: string | null;
  readonly notice: string | null;
  readonly errors: Readonly<Record<'SavePromo' | 'DeletePromo', Errors>>;
  readonly pending: 'SavePromo' | 'DeletePromo' | null;
}

export type PromoEditMsg =
  | { readonly _tag: 'SavePromo'; readonly form: FormData }
  | { readonly _tag: 'DeletePromo'; readonly form: FormData }
  | { readonly _tag: 'Loaded'; readonly edit: PromoEdit }
  | { readonly _tag: 'Saved'; readonly id: number }
  | { readonly _tag: 'Deleted' }
  | { readonly _tag: 'Failed'; readonly error: HttpError };

const NO_ERRORS = { SavePromo: {}, DeletePromo: {} } as const;

const load = (id: number) =>
  get(id === 0 ? '/api/admin/promos/new' : `/api/admin/promos/${String(id)}`, {
    schema: PromoEditSchema,
    onSuccess: (edit): PromoEditMsg => ({ _tag: 'Loaded', edit }),
    onFailure: (error): PromoEditMsg => ({ _tag: 'Failed', error }),
    key: 'admin-promo',
    concurrency: 'switch',
  });

const Saved = v.object({ _tag: v.literal('Saved'), id: v.number() });

function save(s: PromoEditState, data: FormData): Next<PromoEditState, PromoEditMsg> {
  const url = s.id === 0 ? '/api/admin/promos' : `/api/admin/promos/${String(s.id)}`;
  return [
    { ...s, pending: 'SavePromo', notice: null, errors: { ...s.errors, SavePromo: {} } },
    [
      submitForm(url, data, {
        onSuccess: (body): PromoEditMsg | undefined => {
          const saved = v.safeParse(Saved, body);
          return saved.success ? { _tag: 'Saved', id: saved.output.id } : undefined;
        },
        onFailure: (error): PromoEditMsg => ({ _tag: 'Failed', error }),
        key: 'admin-promo-form',
      }),
    ],
  ];
}

function remove(s: PromoEditState, data: FormData): Next<PromoEditState, PromoEditMsg> {
  return [
    { ...s, pending: 'DeletePromo', notice: null, errors: { ...s.errors, DeletePromo: {} } },
    [
      submitForm(`/api/admin/promos/${String(s.id)}/delete`, data, {
        onSuccess: (): PromoEditMsg => ({ _tag: 'Deleted' }),
        onFailure: (error): PromoEditMsg => ({ _tag: 'Failed', error }),
        key: 'admin-promo-form',
      }),
    ],
  ];
}

const rejected = (s: PromoEditState, m: IntentRejected): PromoEditState => {
  const key = m.intent === 'DeletePromo' ? 'DeletePromo' : 'SavePromo';
  return { ...s, pending: null, errors: { ...s.errors, [key]: fieldErrors(m.issues) } };
};

function promoForm(s: PromoEditState, i: { SavePromo: string }, edit: PromoEdit) {
  const p = edit.promo;
  const errors = s.errors.SavePromo;
  const f = 'promo';
  const kind = p?.kind ?? 'percent';
  return html`<form class="admin-form" data-intent=${i.SavePromo} data-component="promo-form">
    ${formError(errors)}
    <fieldset>
      <legend>Code and discount</legend>
      <div class="admin-row">
        ${textField({ form: f, name: 'code', label: 'Code', hint: 'Shoppers type this at checkout.', errors, value: p?.code ?? '', required: true })}
        ${selectField({
          form: f,
          name: 'kind',
          label: 'Discount type',
          errors,
          value: kind,
          emptyLabel: null,
          choices: [
            { value: 'percent', label: 'Percent off' },
            { value: 'fixed', label: 'Amount off (USD)' },
          ],
          required: true,
        })}
        ${textField({ form: f, name: 'amount', label: 'Discount', hint: 'e.g. 15 for 15%, or 5.00 for $5 off.', errors, value: p === null ? '' : promoAmountText(p.kind, p.amount), inputmode: 'decimal', required: true })}
      </div>
    </fieldset>
    <fieldset>
      <legend>Rules</legend>
      <div class="admin-row">
        ${textField({ form: f, name: 'minSubtotal', label: 'Minimum subtotal (USD)', hint: 'Leave empty for no minimum.', errors, value: p === null || p.minSubtotalCents === 0 ? '' : dollarsText(p.minSubtotalCents), inputmode: 'decimal' })}
        ${selectField({
          form: f,
          name: 'departmentId',
          label: 'Department',
          errors,
          value: p?.departmentId === null || p === null ? '' : String(p.departmentId),
          emptyLabel: 'All departments',
          choices: edit.departments.map((d) => ({ value: String(d.id), label: d.name })),
        })}
        ${textField({ form: f, name: 'usageLimit', label: 'Usage limit', hint: 'Total orders allowed; empty for no limit.', errors, value: p?.usageLimit === null || p === null ? '' : String(p.usageLimit), inputmode: 'numeric' })}
      </div>
      <div class="admin-row">
        ${textField({ form: f, name: 'startsOn', label: 'First day', hint: 'Optional.', errors, value: p?.startsOn ?? '', type: 'date' })}
        ${textField({ form: f, name: 'endsOn', label: 'Last day', hint: 'Optional; the code works all of this day.', errors, value: p?.endsOn ?? '', type: 'date' })}
        ${selectField({
          form: f,
          name: 'active',
          label: 'Can be used',
          errors,
          value: p === null || p.active ? 'yes' : 'no',
          emptyLabel: null,
          choices: [
            { value: 'yes', label: 'Yes, active' },
            { value: 'no', label: 'No, inactive' },
          ],
          required: true,
        })}
      </div>
    </fieldset>
    <div class="admin-actions">
      <button type="submit" ?disabled=${s.pending === 'SavePromo'}>
        ${s.id === 0 ? 'Create promo code' : 'Save promo code'}
      </button>
    </div>
  </form>`;
}

function deleteForm(s: PromoEditState, i: { DeletePromo: string }, used: number) {
  if (used > 0) {
    return html`<p data-component="promo-delete-note">
      This code has been used ${used} ${used === 1 ? 'time' : 'times'}, so it can’t be deleted. Set
      “Can be used” to “No” to retire it.
    </p>`;
  }
  return html`<form
    class="admin-actions"
    data-intent=${i.DeletePromo}
    data-component="promo-delete-form"
  >
    ${formError(s.errors.DeletePromo)}
    <label
      ><input type="checkbox" name="confirm" value="yes" required /> Yes, delete this code</label
    >
    <button type="submit" data-variant="danger" ?disabled=${s.pending === 'DeletePromo'}>
      Delete promo code
    </button>
  </form>`;
}

export const AdminPromoEdit = define<PromoEditState, PromoEditMsg, PromoEditProps>(
  'shop-admin-promo',
  {
    shadow: false,
    props: { promoId: { type: Number, default: 0 } },
    init: (props) => [
      {
        id: props.promoId,
        edit: null,
        error: null,
        notice: null,
        errors: NO_ERRORS,
        pending: null,
      },
      [load(props.promoId)],
    ],
    intent: {
      SavePromo: form(PromoForm, (_data, raw) => ({ _tag: 'SavePromo', form: raw })),
      DeletePromo: form(PromoDeleteForm, (_data, raw) => ({ _tag: 'DeletePromo', form: raw })),
    },
    update: {
      SavePromo: (s, m) => save(s, m.form),
      DeletePromo: (s, m) => remove(s, m.form),
      Loaded: (s, m) => ({ ...s, edit: m.edit, error: null }),
      // A new code moves to its own edit page; an edit reloads to show the saved state.
      Saved: (s, m) =>
        s.id === 0
          ? [s, [navigate(`/admin/promos/${String(m.id)}`)]]
          : [{ ...s, pending: null, notice: 'Promo code saved.' }, [load(s.id)]],
      Deleted: (s) => [s, [navigate('/admin/promos')]],
      Failed: (s, m) => ({ ...s, pending: null, error: loadError(m.error) }),
      IntentRejected: rejected,
    },
    drivers: adminDrivers,
    view: (s, i) => {
      const p = s.edit?.promo ?? null;
      const title =
        s.id === 0 ? 'New promo code' : p === null ? 'Edit promo code' : `Edit ${p.code}`;
      return html`<section class="admin-page" data-region="admin-promo">
        <p class="crumbs"><a href="/admin/promos">All promo codes</a></p>
        <h1 tabindex="-1">${title}</h1>
        ${s.error === null ? nothing : html`<p role="alert" data-component="notice" data-kind="error">${s.error}</p>`}
        <p role="status" data-component="notice" data-kind="success" ?hidden=${s.notice === null}>
          ${s.notice ?? nothing}
        </p>
        ${
          s.edit === null
            ? s.error === null
              ? html`<p role="status" data-component="loading">Loading…</p>`
              : nothing
            : html`${promoForm(s, i, s.edit)}
              ${p === null ? nothing : html`<section aria-label="Delete" data-region="admin-promo-delete">${deleteForm(s, i, p.usedCount)}</section>`}`
        }
      </section>`;
    },
  },
);

declare global {
  interface HTMLElementTagNameMap {
    'shop-admin-promo': InstanceType<typeof AdminPromoEdit>;
  }
}

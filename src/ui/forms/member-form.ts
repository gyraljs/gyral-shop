// Account-settings and content forms share one shape (docs/product-specs/accounts.md): a POST
// form that works without JavaScript, validated by a shared schema in the browser first, then
// sent to the same route with submitForm (Gyral ADR 0008). The server answers with a redirect
// (full page load, so flash messages and the header update) or a 422 IntentRejected.
//
// Light DOM (theme contract, ADR 0006 rule 5): document styles in `memberFormCss` apply, and
// themes can restyle the fields through the `member-form` / `field` hooks.
import {
  define,
  form,
  html,
  invalid,
  nothing,
  prop,
  type FormFields,
  type IntentRejected,
} from '@gyral/core';
import {
  failed,
  formError,
  rejected,
  submit,
  submitting,
  type AuthState,
  type Failed,
  type SignedIn,
} from '../account/auth-form.js';
import { goTo } from '../drivers/location.js';
import { CSRF_FIELD } from './csrf.js';
import * as v from 'valibot';

interface FieldBase {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly required?: boolean;
}

export type MemberField =
  | (FieldBase & {
      readonly kind: 'text' | 'email' | 'password' | 'tel';
      readonly autocomplete: string;
      readonly minlength?: number;
      readonly maxlength?: number;
    })
  | (FieldBase & { readonly kind: 'textarea'; readonly maxlength?: number; readonly rows?: number })
  | (FieldBase & {
      readonly kind: 'select';
      readonly autocomplete?: string;
      readonly options: readonly { readonly value: string; readonly label: string }[];
    })
  | (FieldBase & { readonly kind: 'checkbox' });

export interface MemberFormProps {
  readonly csrfToken?: string;
  /** Initial field values (edit forms), as strings; checkboxes use `'on'`. */
  readonly values?: FormFields;
  /**
   * Extra hidden fields, e.g. a reset token. Not named `hidden`: that is HTMLElement's own
   * boolean property, and setting it would hide the whole form.
   */
  readonly hiddenFields?: Readonly<Record<string, string>>;
  /** Overrides the spec's action, e.g. `/account/addresses/12` for one edit form element. */
  readonly action?: string;
}

export interface MemberFormSpec {
  readonly tag: string;
  readonly action: string;
  readonly form: Parameters<typeof form>[0];
  readonly fields: readonly MemberField[];
  readonly submitLabel: string;
  readonly pendingLabel: string;
  /** Field names never put back into the page after a rejection (passwords). */
  readonly secret?: readonly string[];
}

type Msg =
  { readonly _tag: 'Submit'; readonly form: FormData } | SignedIn | Failed | IntentRejected;

const valueOf = (values: FormFields, name: string): string => {
  const value = values[name];
  return typeof value === 'string' ? value : '';
};

function fieldView(s: AuthState, f: MemberField, id: (name: string) => string) {
  const errors = s.errors[f.name];
  const describedBy = [f.hint === undefined ? '' : id(`${f.name}-hint`), id(`${f.name}-error`)]
    .filter((x) => x !== '')
    .join(' ');
  const value = valueOf(s.values, f.name);
  const common = { id: id(f.name), describedBy };
  const control = (() => {
    switch (f.kind) {
      case 'textarea':
        return html`<textarea
          id=${common.id}
          name=${f.name}
          rows=${f.rows ?? 5}
          maxlength=${f.maxlength ?? nothing}
          ?required=${f.required ?? true}
          aria-describedby=${common.describedBy}
          ${invalid(errors)}
        >
${value}</textarea>`;
      case 'select':
        return html`<select
          id=${common.id}
          name=${f.name}
          autocomplete=${f.autocomplete ?? nothing}
          ?required=${f.required ?? true}
          aria-describedby=${common.describedBy}
          ${invalid(errors)}
        >
          <option value="" ?selected=${value === ''}>Choose…</option>
          ${f.options.map(
            (o) =>
              html`<option value=${o.value} ?selected=${value === o.value}>${o.label}</option>`,
          )}
        </select>`;
      case 'checkbox':
        return html`<input
          id=${common.id}
          name=${f.name}
          type="checkbox"
          ?checked=${value === 'on'}
          aria-describedby=${common.describedBy}
        />`;
      default:
        return html`<input
          id=${common.id}
          name=${f.name}
          type=${f.kind}
          autocomplete=${f.autocomplete}
          minlength=${f.minlength ?? nothing}
          maxlength=${f.maxlength ?? nothing}
          ?required=${f.required ?? true}
          aria-describedby=${common.describedBy}
          value=${f.kind === 'password' ? nothing : value}
          ${invalid(errors)}
        />`;
    }
  })();
  const label = html`<label for=${common.id}>${f.label}</label>`;
  return html`<p class="field" data-component="field" data-kind=${f.kind}>
    ${f.kind === 'checkbox' ? html`${control} ${label}` : html`${label} ${control}`}
    ${f.hint === undefined ? nothing : html`<small id=${id(`${f.name}-hint`)}>${f.hint}</small>`}
    <span id=${id(`${f.name}-error`)} class="error"
      >${errors === undefined ? nothing : errors.join(' ')}</span
    >
  </p>`;
}

/** Initial field values: strings (checkboxes `'on'`), as `formFields()` produces them. */
const FormFieldsSchema = v.record(v.string(), v.union([v.string(), v.array(v.string())]));

/** Defines (and registers) one light-DOM member form element. */
export function defineMemberForm(spec: MemberFormSpec) {
  const secret = new Set([...(spec.secret ?? []), CSRF_FIELD]);
  // Ids are prefixed with the tag: several forms can share a page (profile + email).
  const id = (name: string) => `${spec.tag}-${name}`;
  return define<AuthState, Msg, MemberFormProps>(spec.tag, {
    shadow: false,
    props: {
      csrfToken: prop.string(),
      values: prop.value(FormFieldsSchema),
      hiddenFields: prop.value(v.record(v.string(), v.string())),
      action: prop.string(),
    },
    init: (props) => ({ values: props.values ?? {}, errors: {}, pending: false }),
    intent: {
      // Validated in the browser first; the raw FormData then goes to the server unchanged.
      Submit: form(spec.form, (_data, raw) => ({ _tag: 'Submit', form: raw })),
    },
    update: {
      Submit: (s, m, { props }) => [
        submitting(s, m.form, secret),
        [submit(props.action ?? spec.action, m.form, props.csrfToken)],
      ],
      // Pending stays on: the server's page (with its flash message) is about to load.
      SignedIn: (s, m) => [s, [goTo(m.location)]],
      Failed: failed,
      IntentRejected: (s, m) => {
        const next = rejected(s, m);
        const values = Object.fromEntries(
          Object.entries(next.values).filter(([key]) => !secret.has(key)),
        );
        return { ...next, values };
      },
    },
    view: (s, i, { props }) => html`
      <form
        data-intent=${i.Submit}
        data-component="member-form"
        action=${props.action ?? spec.action}
        method="post"
      >
        ${formError(s)}
        <input type="hidden" name=${CSRF_FIELD} value=${props.csrfToken ?? ''} />
        ${Object.entries(props.hiddenFields ?? {}).map(
          ([name, value]) => html`<input type="hidden" name=${name} value=${value} />`,
        )}
        ${spec.fields.map((f) => fieldView(s, f, id))}
        <p class="form-actions">
          <button class="button" ?disabled=${s.pending}>
            ${s.pending ? spec.pendingLabel : spec.submitLabel}
          </button>
        </p>
      </form>
    `,
  });
}

/** Document styles for member forms (light DOM). Tokens only (ADR 0006). */
export const memberFormCss = `
@layer components {
  [data-component="member-form"] { display: grid; gap: var(--space-3); max-inline-size: 32rem; }
  [data-component="member-form"] .field { display: grid; gap: var(--space-1); margin: 0; }
  [data-component="member-form"] .field[data-kind="checkbox"] {
    grid-template-columns: auto 1fr; align-items: center; column-gap: var(--space-2);
  }
  [data-component="member-form"] .field[data-kind="checkbox"] .error,
  [data-component="member-form"] .field[data-kind="checkbox"] small { grid-column: 1 / -1; }
  [data-component="member-form"] label { font-weight: 600; }
  [data-component="member-form"] small { color: var(--ink-muted); }
  [data-component="member-form"] :is(input:not([type="checkbox"]), select, textarea) {
    font: inherit; padding: var(--space-2) var(--space-3);
    border: 1px solid var(--line-strong); border-radius: var(--radius);
    background: var(--surface-raised); color: var(--ink);
  }
  [data-component="member-form"] :is(input, select, textarea):focus-visible {
    outline: 2px solid var(--focus); outline-offset: 1px;
  }
  [data-component="member-form"] :is(input, select, textarea):is(:user-invalid, [aria-invalid="true"]) {
    border-color: var(--danger);
  }
  [data-component="member-form"] .error { color: var(--danger); font-size: 0.9rem; }
  [data-component="member-form"] .error:empty { display: none; }
  [data-component="member-form"] .form-error {
    margin: 0; padding: var(--space-2) var(--space-3);
    border-inline-start: 4px solid var(--danger);
    background: color-mix(in oklch, var(--danger) 10%, var(--surface-raised));
  }
  [data-component="member-form"] .form-actions { margin: 0; }
  [data-component="member-form"] button { font: inherit; font-weight: 600; }
  [data-component="member-form"] button:disabled { opacity: 0.6; cursor: progress; }
}
`;

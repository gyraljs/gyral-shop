// What the sign-in and registration components share: state, the server round trip, field
// rendering and styles. Both work as plain POST forms without JavaScript; with it, Gyral's
// form() validates first and submitForm() posts the same FormData to the same route, which
// answers JSON (Gyral ADR 0008, "Round trip").
import {
  css,
  fieldErrors,
  html,
  invalid,
  nothing,
  redirectedTo,
  type Command,
  type FormFields,
  type IntentRejected,
} from '@gyral/core';
import { submitForm, type HttpError } from '@gyral/http';
import { CSRF_FIELD, CSRF_HEADER } from '../forms/csrf.js';
import { SECRET_FIELDS } from './schemas.js';

export interface AuthState {
  /** Text to re-fill after a rejection. Never passwords: state is serialized into the page. */
  readonly values: FormFields;
  /** Field errors by name; `''` holds form-level errors (wrong password, network). */
  readonly errors: Readonly<Record<string, readonly string[]>>;
  readonly pending: boolean;
}

export interface AuthProps {
  readonly csrfToken?: string;
  /** Where to return after signing in (checked again by the server). */
  readonly next?: string;
}

export type SignedIn = { readonly _tag: 'SignedIn'; readonly location: string };
export type Failed = { readonly _tag: 'Failed'; readonly message: string };

export const initialAuthState = (): AuthState => ({ values: {}, errors: {}, pending: false });

const refill = (values: FormFields = {}): FormFields =>
  Object.fromEntries(Object.entries(values).filter(([key]) => !SECRET_FIELDS.has(key)));

export const rejected = (s: AuthState, m: IntentRejected): AuthState => ({
  values: refill(m.values),
  errors: fieldErrors(m.issues),
  pending: false,
});

export const failed = (s: AuthState, m: Failed): AuthState => ({
  ...s,
  errors: { '': [m.message] },
  pending: false,
});

const GENERIC_FAILURE = 'Something went wrong. Check your connection and try again.';

const failureMessage = (error: HttpError): string =>
  error._tag === 'HttpStatusError' && error.status === 429
    ? 'Too many attempts. Wait a few minutes, then try again.'
    : error._tag === 'HttpStatusError' && error.status === 403
      ? 'Your session expired. Reload the page and try again.'
      : GENERIC_FAILURE;

/**
 * Sends the validated form to the route the no-JS form posts to. A 422 answer arrives as
 * `IntentRejected` (wrong password, email taken), anything else but success as `Failed`.
 */
export function submit(
  path: string,
  form: FormData,
  csrfToken: string | undefined,
): Command<SignedIn | Failed | IntentRejected> {
  return submitForm<SignedIn | Failed, Failed>(path, form, {
    ...(csrfToken === undefined ? {} : { csrf: { token: csrfToken, header: CSRF_HEADER } }),
    onSuccess: (body) => {
      const location = redirectedTo(body);
      return location === undefined
        ? { _tag: 'Failed', message: GENERIC_FAILURE }
        : { _tag: 'SignedIn', location };
    },
    onFailure: (error) => ({ _tag: 'Failed', message: failureMessage(error) }),
    key: 'auth',
  });
}

export interface FieldSpec {
  readonly name: string;
  readonly label: string;
  readonly type: 'text' | 'email' | 'password';
  readonly autocomplete: string;
  readonly minlength?: number;
  readonly maxlength?: number;
  readonly hint?: string;
}

const text = (values: FormFields, key: string): string => {
  const value = values[key];
  return typeof value === 'string' ? value : '';
};

// aria-invalid is also a plain attribute: the server can't run invalid() (it calls
// setCustomValidity), but no-JS users still need errors announced (Gyral ADR 0008).
export const fieldView = (s: AuthState, f: FieldSpec) => {
  const errors = s.errors[f.name];
  const described = [f.hint === undefined ? '' : `${f.name}-hint`, `${f.name}-error`]
    .filter((id) => id !== '')
    .join(' ');
  return html`<p class="field">
    <label for=${f.name}>${f.label}</label>
    ${f.hint === undefined ? nothing : html`<small id=${`${f.name}-hint`}>${f.hint}</small>`}
    <input
      id=${f.name}
      name=${f.name}
      type=${f.type}
      autocomplete=${f.autocomplete}
      minlength=${f.minlength ?? nothing}
      maxlength=${f.maxlength ?? nothing}
      required
      .value=${f.type === 'password' ? '' : text(s.values, f.name)}
      value=${f.type === 'password' ? nothing : text(s.values, f.name)}
      aria-describedby=${described}
      aria-invalid=${errors === undefined ? nothing : 'true'}
      ${invalid(errors)}
    />
    <span id=${`${f.name}-error`} class="error">${errors?.join(' ') ?? nothing}</span>
  </p>`;
};

/** Form-level problems (wrong password, too many attempts) above the fields. */
export const formError = (s: AuthState) => {
  const errors = s.errors[''];
  return errors === undefined
    ? nothing
    : html`<p class="form-error" role="alert">${errors.join(' ')}</p>`;
};

export const hiddenFields = (props: AuthProps) =>
  html`<input type="hidden" name=${CSRF_FIELD} value=${props.csrfToken ?? ''} />
    <input type="hidden" name="next" value=${props.next ?? ''} />`;

export const authStyles = css`
  @layer components {
    :host {
      display: block;
      max-inline-size: 26rem;
    }
    form {
      display: grid;
      gap: var(--space-3);
    }
    .field {
      display: grid;
      gap: var(--space-1);
      margin: 0;
    }
    label {
      font-weight: 600;
    }
    small {
      color: var(--ink-muted);
    }
    input {
      font: inherit;
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius);
      background: var(--surface-raised);
      color: var(--ink);
    }
    input:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 1px;
    }
    input:user-invalid,
    input[aria-invalid='true'] {
      border-color: var(--danger);
    }
    .error {
      color: var(--danger);
      min-block-size: 1lh;
      font-size: 0.9rem;
    }
    .form-error {
      margin: 0;
      padding: var(--space-2) var(--space-3);
      border-inline-start: 4px solid var(--danger);
      background: color-mix(in oklch, var(--danger) 10%, var(--surface-raised));
    }
    button {
      justify-self: start;
      font: inherit;
      font-weight: 600;
      padding: var(--space-2) var(--space-4);
      border: 0;
      border-radius: var(--radius);
      background: var(--brand);
      color: var(--brand-ink);
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.6;
      cursor: progress;
    }
    button:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }
  }
`;

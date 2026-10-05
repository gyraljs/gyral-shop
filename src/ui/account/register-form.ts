import { define, form, html, type IntentRejected } from '@gyral/core';
import { MAX_NAME_LENGTH, MIN_PASSWORD_LENGTH } from '../../domain/accounts.js';
import { goTo } from '../drivers/location.js';
import {
  failed,
  fieldView,
  formError,
  hiddenFields,
  initialAuthState,
  rejected,
  submit,
  type AuthProps,
  type AuthState,
  type Failed,
  type FieldSpec,
  type SignedIn,
} from './auth-form.js';
import { RegisterForm } from './schemas.js';

export type RegisterMsg =
  { readonly _tag: 'Register'; readonly form: FormData } | SignedIn | Failed | IntentRejected;

const FIELDS: readonly FieldSpec[] = [
  {
    name: 'name',
    label: 'Full name',
    type: 'text',
    autocomplete: 'name',
    maxlength: MAX_NAME_LENGTH,
  },
  { name: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    autocomplete: 'new-password',
    minlength: MIN_PASSWORD_LENGTH,
    hint: `At least ${String(MIN_PASSWORD_LENGTH)} characters.`,
  },
  { name: 'confirm', label: 'Repeat password', type: 'password', autocomplete: 'new-password' },
];

/** Registration form: same two paths as sign-in, posting to /account/register. */
export const RegisterFormElement = define<AuthState, RegisterMsg, AuthProps>('shop-register', {
  props: { csrfToken: { attribute: 'csrf-token' }, next: { type: String } },
  init: initialAuthState,
  intent: {
    // Validated in the browser first; the raw FormData then goes to the server unchanged.
    Register: form(RegisterForm, (_data, raw) => ({ _tag: 'Register', form: raw })),
  },
  update: {
    Register: (s, m, { props }) => [
      { ...s, pending: true, errors: {} },
      [submit('/account/register', m.form, props.csrfToken)],
    ],
    SignedIn: (s, m) => [s, [goTo(m.location)]],
    Failed: failed,
    IntentRejected: rejected,
  },
  view: (s, i, { props }) => html`
    <form data-intent=${i.Register} action="/account/register" method="post">
      ${formError(s)} ${hiddenFields(props)} ${FIELDS.map((f) => fieldView(s, f))}
      <button ?disabled=${s.pending}>${s.pending ? 'Creating account…' : 'Create account'}</button>
    </form>
  `,
  // Light DOM (ADR 0006 rule 5): styled by document CSS (authCss).
  shadow: false,
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-register': InstanceType<typeof RegisterFormElement>;
  }
}

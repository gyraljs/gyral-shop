import { define, form, html, type IntentRejected } from '@gyral/core';
import { goTo } from '../drivers/location.js';
import {
  authProps,
  failed,
  fieldView,
  formError,
  hiddenFields,
  initialAuthState,
  rejected,
  submit,
  submitting,
  type AuthProps,
  type AuthState,
  type Failed,
  type FieldSpec,
  type SignedIn,
} from './auth-form.js';
import { LoginForm } from './schemas.js';

export type LoginMsg =
  { readonly _tag: 'Login'; readonly form: FormData } | SignedIn | Failed | IntentRejected;

const FIELDS: readonly FieldSpec[] = [
  { name: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
  { name: 'password', label: 'Password', type: 'password', autocomplete: 'current-password' },
];

/** Sign-in form: a POST to /account/login without JS, the same POST via submitForm with it. */
export const LoginFormElement = define<AuthState, LoginMsg, AuthProps>('shop-login', {
  props: authProps,
  init: initialAuthState,
  intent: {
    // Validated in the browser first; the raw FormData then goes to the server unchanged.
    Login: form(LoginForm, (_data, raw) => ({ _tag: 'Login', form: raw })),
  },
  update: {
    Login: (s, m, { props }) => [
      submitting(s, m.form),
      [submit('/account/login', m.form, props.csrfToken)],
    ],
    // Pending stays on: the page is about to reload with the member signed in.
    SignedIn: (s, m) => [s, [goTo(m.location)]],
    Failed: failed,
    IntentRejected: rejected,
  },
  view: (s, i, { props }) => html`
    <form data-intent=${i.Login} action="/account/login" method="post">
      ${formError(s)} ${hiddenFields(props)} ${FIELDS.map((f) => fieldView(s, f))}
      <button ?disabled=${s.pending}>${s.pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  `,
  // Light DOM (ADR 0006 rule 5): styled by document CSS (authCss).
  shadow: false,
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-login': InstanceType<typeof LoginFormElement>;
  }
}

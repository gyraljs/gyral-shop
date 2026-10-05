import { define, form, html, type IntentRejected } from '@gyral/core';
import { goTo } from '../drivers/location.js';
import {
  authStyles,
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
import { LoginForm } from './schemas.js';

export type LoginMsg =
  | {
      readonly _tag: 'Login';
      readonly email: string;
      readonly password: string;
      readonly next: string;
    }
  | SignedIn
  | Failed
  | IntentRejected;

const FIELDS: readonly FieldSpec[] = [
  { name: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
  { name: 'password', label: 'Password', type: 'password', autocomplete: 'current-password' },
];

/** Sign-in form: a POST to /account/login without JS, a JSON round trip with it. */
export const LoginFormElement = define<AuthState, LoginMsg, AuthProps>('shop-login', {
  props: { csrfToken: { attribute: 'csrf-token' }, next: { type: String } },
  init: initialAuthState,
  intent: {
    Login: form(LoginForm, (data) => ({
      _tag: 'Login',
      email: data.email,
      password: data.password,
      next: data.next,
    })),
  },
  update: {
    Login: (s, m, { props }) => [
      { ...s, pending: true, errors: {} },
      [
        submit(
          '/account/login',
          { email: m.email, password: m.password, next: m.next },
          props.csrfToken,
        ),
      ],
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
  styles: authStyles,
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-login': InstanceType<typeof LoginFormElement>;
  }
}

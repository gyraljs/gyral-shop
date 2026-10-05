// Account pages: sign in, register and the member's account landing page. The forms are
// Gyral components (shop-login, shop-register); the rest is server-rendered markup.
import { html, nothing, type IntentRejected } from '@gyral/core';
import { csrfField } from '../forms/csrf.js';
import '../account/login-form.js'; // registers <shop-login> for server rendering
import '../account/register-form.js'; // registers <shop-register>

export interface AuthPageData {
  readonly csrfToken: string;
  /** Validated `?next=` target ('' when absent). */
  readonly next: string;
  /** The rejection to show (server-rendered, no-JS path). */
  readonly rejected?: IntentRejected;
}

const withNext = (path: string, next: string) =>
  next === '' ? path : `${path}?next=${encodeURIComponent(next)}`;

const messages = (rejected: IntentRejected | undefined) =>
  rejected === undefined ? [] : [rejected];

export const loginPage = ({ csrfToken, next, rejected }: AuthPageData) => html`
  <section class="auth" aria-labelledby="title" data-region="auth">
    <h1 id="title">Sign in</h1>
    <shop-login
      csrf-token=${csrfToken}
      next=${next}
      .initialMessages=${messages(rejected)}
    ></shop-login>
    <p><a href="/account/forgot">Forgot your password?</a></p>
    <p>New here? <a href=${withNext('/account/register', next)}>Create an account</a></p>
  </section>
`;

export const registerPage = ({ csrfToken, next, rejected }: AuthPageData) => html`
  <section class="auth" aria-labelledby="title" data-region="auth">
    <h1 id="title">Create an account</h1>
    <shop-register
      csrf-token=${csrfToken}
      next=${next}
      .initialMessages=${messages(rejected)}
    ></shop-register>
    <p>Already have an account? <a href=${withNext('/account/login', next)}>Sign in</a></p>
  </section>
`;

export interface AccountPageData {
  readonly name: string;
  readonly email: string;
  readonly role: 'customer' | 'admin';
  readonly csrfToken: string;
}

/** The member's account landing page. Later beads add profile, addresses and orders. */
export const accountPage = ({ name, email, role, csrfToken }: AccountPageData) => html`
  <section class="account" aria-labelledby="title" data-region="account">
    <h1 id="title">Your account</h1>
    <dl class="account-details">
      <dt>Name</dt>
      <dd>${name}</dd>
      <dt>Email</dt>
      <dd>${email}</dd>
      ${
        role === 'admin'
          ? html`<dt>Role</dt>
              <dd>Administrator</dd>`
          : nothing
      }
    </dl>
    <form method="post" action="/account/logout">
      ${csrfField(csrfToken)}
      <button class="button">Sign out</button>
    </form>
  </section>
`;

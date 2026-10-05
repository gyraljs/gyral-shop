// Account settings pages: overview, profile, password, address book, password reset
// (docs/product-specs/accounts.md). Server-rendered light-DOM markup; the forms are the
// member-form elements in account/settings-forms.ts. Theme hooks: ADR 0006.
import { html, nothing, type FormFields, type IntentRejected } from '@gyral/core';
import { addressLines } from '../../domain/checkout.js';
import { STATE_NAMES } from '../../domain/us-states.js';
import { isStateCode } from '../../domain/tax.js';
import { csrfField } from '../forms/csrf.js';
import '../account/settings-forms.js'; // registers the form elements for server rendering

export interface Notice {
  readonly kind: 'success' | 'error';
  readonly message: string;
}

export const notice = (n: Notice | undefined) =>
  n === undefined
    ? nothing
    : html`<p
        class="notice"
        data-component="notice"
        data-kind=${n.kind}
        role=${n.kind === 'error' ? 'alert' : 'status'}
      >
        ${n.message}
      </p>`;

export type AccountSection = 'overview' | 'profile' | 'addresses' | 'password' | 'wishlist';
type Section = AccountSection;

const SECTIONS: readonly { readonly id: Section; readonly href: string; readonly label: string }[] =
  [
    { id: 'overview', href: '/account', label: 'Overview' },
    { id: 'profile', href: '/account/profile', label: 'Name and email' },
    { id: 'addresses', href: '/account/addresses', label: 'Addresses' },
    { id: 'password', href: '/account/password', label: 'Password' },
    { id: 'wishlist', href: '/account/wishlist', label: 'Wishlist' },
  ];

/** The account section navigation and page frame (also used by the wishlist page). */
export const frame = (current: Section, title: string, body: unknown, flash?: Notice) => html`
  <div class="account-layout" data-region="account">
    <nav aria-label="Account" data-region="account-nav">
      <ul>
        ${SECTIONS.map(
          (s) =>
            html`<li>
              <a href=${s.href} aria-current=${s.id === current ? 'page' : nothing}>${s.label}</a>
            </li>`,
        )}
      </ul>
    </nav>
    <section class="account" aria-labelledby="title">
      <h1 id="title">${title}</h1>
      ${notice(flash)} ${body}
    </section>
  </div>
`;

const rejections = (r: IntentRejected | undefined) => (r === undefined ? [] : [r]);

export interface OverviewData {
  readonly name: string;
  readonly email: string;
  readonly role: 'customer' | 'admin';
  readonly csrfToken: string;
  readonly defaultAddress?: readonly string[];
  readonly flash?: Notice;
}

export const accountOverview = (d: OverviewData) =>
  frame(
    'overview',
    'Your account',
    html`<dl class="account-details" data-component="account-details">
        <dt>Name</dt>
        <dd>${d.name}</dd>
        <dt>Email</dt>
        <dd>${d.email}</dd>
        <dt>Default address</dt>
        <dd>
          ${
            d.defaultAddress === undefined
              ? html`None yet. <a href="/account/addresses">Add one</a>`
              : d.defaultAddress.join(', ')
          }
        </dd>
        ${
          d.role === 'admin'
            ? html`<dt>Role</dt>
                <dd>Administrator</dd>`
            : nothing
        }
      </dl>
      <form method="post" action="/account/logout">
        ${csrfField(d.csrfToken)}
        <button class="button">Sign out</button>
      </form>`,
    d.flash,
  );

export interface ProfileData {
  readonly csrfToken: string;
  readonly name: string;
  readonly email: string;
  readonly flash?: Notice;
  /** A rejected form and which one it was. */
  readonly rejected?: { readonly form: 'profile' | 'email'; readonly issue: IntentRejected };
}

export const profilePage = (d: ProfileData) =>
  frame(
    'profile',
    'Name and email',
    html`<section aria-labelledby="name-title" data-region="profile">
        <h2 id="name-title">Your name</h2>
        <shop-profile-form
          csrf-token=${d.csrfToken}
          .values=${{ name: d.name }}
          .initialMessages=${d.rejected?.form === 'profile' ? [d.rejected.issue] : []}
        ></shop-profile-form>
      </section>
      <section aria-labelledby="email-title" data-region="email">
        <h2 id="email-title">Your email</h2>
        <p>Currently <strong>${d.email}</strong>. Changing it needs your password.</p>
        <shop-email-form
          csrf-token=${d.csrfToken}
          .initialMessages=${d.rejected?.form === 'email' ? [d.rejected.issue] : []}
        ></shop-email-form>
      </section>`,
    d.flash,
  );

export interface PasswordData {
  readonly csrfToken: string;
  readonly flash?: Notice;
  readonly rejected?: IntentRejected;
}

export const passwordPage = (d: PasswordData) =>
  frame(
    'password',
    'Change your password',
    html`<p>Changing your password signs you out everywhere else.</p>
      <shop-password-form
        csrf-token=${d.csrfToken}
        .initialMessages=${rejections(d.rejected)}
      ></shop-password-form>`,
    d.flash,
  );

export interface AddressView {
  readonly id: number;
  readonly name: string;
  readonly line1: string;
  readonly line2: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly phone: string;
  readonly isDefault: boolean;
}

const stateName = (code: string) => (isStateCode(code) ? STATE_NAMES[code] : code);

const addressCard = (a: AddressView, csrfToken: string) => html`
  <li data-component="address-card" data-default=${a.isDefault ? 'true' : nothing}>
    <address>
      ${addressLines({ ...a, state: stateName(a.state) }).map((line) => html`${line}<br />`)}
    </address>
    ${a.isDefault ? html`<p class="badge" data-component="badge">Default</p>` : nothing}
    <p class="address-actions">
      <a href=${`/account/addresses/${String(a.id)}/edit`}
        >Edit<span class="visually-hidden"> address for ${a.name}</span></a
      >
    </p>
    ${
      a.isDefault
        ? nothing
        : html`<form method="post" action=${`/account/addresses/${String(a.id)}/default`}>
            ${csrfField(csrfToken)}
            <button class="button-link">
              Make default<span class="visually-hidden"> (${a.name})</span>
            </button>
          </form>`
    }
    <form method="post" action=${`/account/addresses/${String(a.id)}/delete`}>
      ${csrfField(csrfToken)}
      <button class="button-link">
        Delete<span class="visually-hidden"> address for ${a.name}</span>
      </button>
    </form>
  </li>
`;

export interface AddressesData {
  readonly csrfToken: string;
  readonly addresses: readonly AddressView[];
  readonly flash?: Notice;
  readonly rejected?: IntentRejected;
}

export const addressesPage = (d: AddressesData) =>
  frame(
    'addresses',
    'Your addresses',
    html`${
        d.addresses.length === 0
          ? html`<p>You haven't saved an address yet.</p>`
          : html`<ul class="address-list" data-region="address-list">
              ${d.addresses.map((a) => addressCard(a, d.csrfToken))}
            </ul>`
      }
      <section aria-labelledby="add-title" data-region="address-new">
        <h2 id="add-title">Add an address</h2>
        <shop-address-form
          csrf-token=${d.csrfToken}
          .initialMessages=${rejections(d.rejected)}
        ></shop-address-form>
      </section>`,
    d.flash,
  );

export interface EditAddressData {
  readonly csrfToken: string;
  readonly address: AddressView;
  readonly rejected?: IntentRejected;
}

const addressValues = (a: AddressView): FormFields => ({
  name: a.name,
  line1: a.line1,
  line2: a.line2,
  city: a.city,
  state: a.state,
  postalCode: a.postalCode,
  phone: a.phone,
  ...(a.isDefault ? { isDefault: 'on' } : {}),
});

export const editAddressPage = (d: EditAddressData) =>
  frame(
    'addresses',
    'Edit address',
    html`<shop-address-edit-form
        csrf-token=${d.csrfToken}
        action=${`/account/addresses/${String(d.address.id)}`}
        .values=${addressValues(d.address)}
        .initialMessages=${rejections(d.rejected)}
      ></shop-address-edit-form>
      <p><a href="/account/addresses">Back to your addresses</a></p>`,
  );

// Password reset (signed out): plain sections, no account navigation.

export const forgotPage = (csrfToken: string, rejected?: IntentRejected) => html`
  <section class="auth" aria-labelledby="title" data-region="password-reset">
    <h1 id="title">Reset your password</h1>
    <p>Enter the email you shop with. We'll send a link to choose a new password.</p>
    <shop-reset-request-form
      csrf-token=${csrfToken}
      .initialMessages=${rejections(rejected)}
    ></shop-reset-request-form>
    <p><a href="/account/login">Back to sign in</a></p>
  </section>
`;

export const forgotSentPage = (minutes: number) => html`
  <section class="auth" aria-labelledby="title" data-region="password-reset">
    <h1 id="title">Check your email</h1>
    <p>
      If an account uses that email, we've sent it a link to reset the password. The link works once
      and expires in ${minutes} minutes.
    </p>
    <p><a href="/account/login">Back to sign in</a></p>
  </section>
`;

export const resetPage = (csrfToken: string, token: string, rejected?: IntentRejected) => html`
  <section class="auth" aria-labelledby="title" data-region="password-reset">
    <h1 id="title">Choose a new password</h1>
    <shop-reset-form
      csrf-token=${csrfToken}
      .hiddenFields=${{ token }}
      .initialMessages=${rejections(rejected)}
    ></shop-reset-form>
  </section>
`;

export const resetInvalidPage = () => html`
  <section class="auth" aria-labelledby="title" data-region="password-reset">
    <h1 id="title">This link has expired</h1>
    <p>Reset links work once and expire after a short time.</p>
    <p><a class="button" href="/account/forgot">Send a new link</a></p>
  </section>
`;

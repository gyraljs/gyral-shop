// <shop-admin-users>: search members, change roles, disable or enable accounts
// (docs/product-specs/admin.md, "Users"). Every change asks for confirmation first; the server
// refuses changes to the admin's own account and never leaves the store without an admin.
import {
  define,
  fieldErrors,
  focus,
  form,
  html,
  nothing,
  prop,
  type IntentRejected,
  type Next,
} from '@gyral/core';
import { get, submitForm, type HttpError } from '@gyral/http';
import { navigate } from '@gyral/router';
import * as v from 'valibot';
import {
  USER_ACTION_LABEL,
  userActions,
  UserListSchema,
  UserUpdatedSchema,
  type UserAction,
  type UserList,
  type UserRow,
} from '../../domain/admin-manage.js';
import { adminDrivers } from './drivers.js';
import { formError, type Errors } from './fields.js';
import { dateTime, loadError } from './format.js';
import { ListFilterForm, UserActionForm, UserAskForm } from './manage-schemas.js';
import { pager } from './table.js';

export interface UsersProps {
  readonly search: string;
}

export interface Confirming {
  readonly userId: number;
  readonly action: UserAction;
  readonly name: string;
}

export interface UsersState {
  readonly search: string;
  readonly list: UserList | null;
  readonly error: string | null;
  readonly notice: string | null;
  readonly confirming: Confirming | null;
  readonly errors: Errors;
  readonly pending: boolean;
}

export type UsersMsg =
  | { readonly _tag: 'Search'; readonly q: string }
  | { readonly _tag: 'Ask'; readonly userId: number; readonly action: UserAction }
  | { readonly _tag: 'Cancel' }
  | { readonly _tag: 'UserAction'; readonly form: FormData }
  | { readonly _tag: 'Updated'; readonly notice: string }
  | { readonly _tag: 'Loaded'; readonly search: string; readonly list: UserList }
  | { readonly _tag: 'Failed'; readonly error: HttpError };

const params = (search: string) => new URLSearchParams(search);
const pageOf = (search: string) => Number(params(search).get('page') ?? '1') || 1;
const qOf = (search: string) => (params(search).get('q') ?? '').trim();

export function usersHref(q: string, page: number): string {
  const p = new URLSearchParams();
  if (q !== '') p.set('q', q);
  if (page > 1) p.set('page', String(page));
  const text = p.toString();
  return text === '' ? '/admin/users' : `/admin/users?${text}`;
}

const load = (search: string) =>
  get(
    `/api/admin/users?${new URLSearchParams({ q: qOf(search), page: String(pageOf(search)) }).toString()}`,
    {
      schema: UserListSchema,
      onSuccess: (list): UsersMsg => ({ _tag: 'Loaded', search, list }),
      onFailure: (error): UsersMsg => ({ _tag: 'Failed', error }),
      key: 'admin-users',
      concurrency: 'switch',
    },
  );

const DONE: Readonly<Record<UserAction, (name: string) => string>> = {
  promote: (n) => `${n} is now an admin.`,
  demote: (n) => `${n} is no longer an admin.`,
  disable: (n) => `${n}’s account is disabled and signed out everywhere.`,
  enable: (n) => `${n}’s account is enabled.`,
};

const QUESTION: Readonly<Record<UserAction, (name: string) => string>> = {
  promote: (n) => `Make ${n} an admin? They will be able to change products, orders and users.`,
  demote: (n) => `Remove ${n}’s admin access? They will be signed out everywhere.`,
  disable: (n) => `Disable ${n}’s account? They will be signed out and can’t sign in again.`,
  enable: (n) => `Enable ${n}’s account so they can sign in again?`,
};

function act(s: UsersState, data: FormData): Next<UsersState, UsersMsg> {
  const confirming = s.confirming;
  if (confirming === null) return s;
  return [
    { ...s, pending: true, errors: {}, notice: null },
    [
      submitForm(`/api/admin/users/${String(confirming.userId)}`, data, {
        onSuccess: (body): UsersMsg | undefined =>
          v.is(UserUpdatedSchema, body)
            ? { _tag: 'Updated', notice: DONE[confirming.action](confirming.name) }
            : undefined,
        onFailure: (error): UsersMsg => ({ _tag: 'Failed', error }),
        key: 'admin-user-action',
      }),
    ],
  ];
}

function row(u: UserRow, self: number, i: { Ask: string }) {
  return html`<tr data-component="user-row">
    <th scope="row">${u.name}${u.id === self ? html` <small>(you)</small>` : nothing}</th>
    <td>${u.email}</td>
    <td>${u.role === 'admin' ? 'Admin' : 'Customer'}</td>
    <td>${u.disabled ? 'Disabled' : 'Active'}</td>
    <td class="num">${u.orders}</td>
    <td><time datetime=${u.createdAt}>${dateTime.format(new Date(u.createdAt))}</time></td>
    <td>
      ${userActions(u, self).map(
        (action) =>
          html`<form class="inline" data-intent=${i.Ask} data-component="user-action">
            <input type="hidden" name="userId" value=${String(u.id)} />
            <input type="hidden" name="action" value=${action} />
            <button
              type="submit"
              data-variant=${action === 'disable' || action === 'demote' ? 'danger' : 'quiet'}
            >
              ${USER_ACTION_LABEL[action]}<span class="visually-hidden"> for ${u.name}</span>
            </button>
          </form>`,
      )}
    </td>
  </tr>`;
}

function confirmPanel(s: UsersState, i: { UserAction: string; Cancel: string }) {
  const c = s.confirming;
  if (c === null) return nothing;
  return html`<section
    class="admin-confirm"
    aria-labelledby="confirm-title"
    data-region="admin-confirm"
  >
    <h2 id="confirm-title" tabindex="-1">${USER_ACTION_LABEL[c.action]}</h2>
    <p>${QUESTION[c.action](c.name)}</p>
    ${formError(s.errors)}
    <form class="admin-actions" data-intent=${i.UserAction} data-component="user-confirm">
      <input type="hidden" name="userId" value=${String(c.userId)} />
      <input type="hidden" name="action" value=${c.action} />
      <input type="hidden" name="confirm" value="yes" />
      <button type="submit" ?disabled=${s.pending}>Confirm</button>
      <button type="button" data-variant="quiet" data-intent=${i.Cancel}>Cancel</button>
    </form>
  </section>`;
}

export const AdminUsers = define<UsersState, UsersMsg, UsersProps>('shop-admin-users', {
  shadow: false,
  props: { search: prop.string({ default: '' }) },
  init: (props) => [
    {
      search: props.search,
      list: null,
      error: null,
      notice: null,
      confirming: null,
      errors: {},
      pending: false,
    },
    [load(props.search)],
  ],
  intent: {
    Search: form(ListFilterForm, (data) => ({ _tag: 'Search', q: data.q })),
    Ask: form(UserAskForm, (data) => ({ _tag: 'Ask', userId: data.userId, action: data.action })),
    Cancel: () => ({ _tag: 'Cancel' }),
    UserAction: form(UserActionForm, (_data, raw) => ({ _tag: 'UserAction', form: raw })),
  },
  update: {
    Search: (s, m) => [s, [navigate(usersHref(m.q, 1))]],
    Ask: (s, m) => {
      const target = s.list?.rows.find((r) => r.id === m.userId);
      if (target === undefined) return s;
      return [
        {
          ...s,
          confirming: { userId: m.userId, action: m.action, name: target.name },
          errors: {},
          notice: null,
        },
        [focus('#confirm-title')],
      ];
    },
    Cancel: (s) => [{ ...s, confirming: null, errors: {} }, [focus('h1')]],
    UserAction: (s, m) => act(s, m.form),
    Updated: (s, m) => [
      { ...s, confirming: null, pending: false, notice: m.notice },
      [load(s.search), focus('h1')],
    ],
    Loaded: (s, m) => (m.search === s.search ? { ...s, list: m.list, error: null } : s),
    Failed: (s, m) => ({ ...s, pending: false, error: loadError(m.error) }),
    IntentRejected: (s, m: IntentRejected) => ({
      ...s,
      pending: false,
      errors: fieldErrors(m.issues),
    }),
    PropsChanged: (s, m) =>
      m.props.search === s.search
        ? s
        : [{ ...s, search: m.props.search, confirming: null }, [load(m.props.search)]],
  },
  drivers: adminDrivers,
  view: (s, i) =>
    html`<section class="admin-page" data-region="admin-users">
      <h1 tabindex="-1">Users</h1>
      <form
        class="admin-toolbar"
        data-intent=${i.Search}
        role="search"
        data-component="user-search"
      >
        <label>Search name or email <input type="search" name="q" value=${qOf(s.search)} /></label>
        <button type="submit">Search</button>
      </form>
      ${s.error === null ? nothing : html`<p role="alert" data-component="notice" data-kind="error">${s.error}</p>`}
      <p role="status" data-component="notice" data-kind="success" ?hidden=${s.notice === null}>
        ${s.notice}
      </p>
      ${confirmPanel(s, i)}
      ${
        s.list === null
          ? s.error === null
            ? html`<p role="status" data-component="loading">Loading…</p>`
            : nothing
          : html`<div class="admin-table-wrap" tabindex="0" role="region" aria-label="Users">
                <table class="admin-table" data-component="admin-table">
                  <caption>
                    ${s.list.total} ${s.list.total === 1 ? 'user' : 'users'}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Email</th>
                      <th scope="col">Role</th>
                      <th scope="col">Account</th>
                      <th scope="col" class="num">Orders</th>
                      <th scope="col">Joined</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${s.list.rows.map((u) => row(u, s.list?.self ?? 0, i))}
                  </tbody>
                </table>
              </div>
              ${pager(s.list.page, s.list.pages, (page) => usersHref(qOf(s.search), page))}`
      }
    </section>`,
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-admin-users': InstanceType<typeof AdminUsers>;
  }
}

import { css, define, html, nothing, repeat, type Stateless } from '@gyral/core';
import { csrfField } from '../forms/csrf.js';

/** The signed-in member, as far as the header needs to know. */
export interface AccountSummary {
  readonly firstName: string;
  /** For the sign-out form. */
  readonly csrfToken: string;
}

export interface DepartmentLink {
  readonly slug: string;
  readonly name: string;
}

// Optional: a custom element's props are unset until the parent (or the hydration seed)
// provides them, so the view must cope with undefined.
export interface HeaderProps {
  readonly departments?: readonly DepartmentLink[];
  /** The current search query, echoed in the search box. */
  readonly query?: string;
  /** Slug of the department being browsed, marked as the current link. */
  readonly current?: string;
  /** Set when a member is signed in. */
  readonly account?: AccountSummary;
}

/**
 * The site header: brand, search, account and cart entry points, department navigation.
 * Every part works without JavaScript (links, a GET form, a <details> account menu and a POST
 * sign-out form, a <details> mini-cart).
 */
// A disclosure, not a popover: it opens and closes without JavaScript, and Baseline has
// supported <details> for years (ADR 0003 in Gyral; popover is only newly widely available).
const accountLinks = (account: AccountSummary | undefined) =>
  account === undefined
    ? html`<a href="/account/login">Sign in</a> <a href="/account/register">Register</a>`
    : html`<details class="account-menu">
        <summary>Hi, ${account.firstName}</summary>
        <ul>
          <li><a href="/account">Your account</a></li>
          <li>
            <form method="post" action="/account/logout">
              ${csrfField(account.csrfToken)}
              <button type="submit">Sign out</button>
            </form>
          </li>
        </ul>
      </details>`;

export const SiteHeader = define<Stateless, never, HeaderProps>('shop-header', {
  props: {
    departments: { attribute: false },
    query: { type: String },
    current: { type: String },
    account: { attribute: false },
  },
  intent: {},
  update: {},
  view: (_s, _i, { props }) => html`
    <header>
      <div class="bar">
        <a class="brand" href="/" aria-label="Gyral Goods home">Gyral <span>Goods</span></a>
        <search>
          <form action="/search" method="get" role="search">
            <label for="q" class="visually-hidden">Search products</label>
            <input
              id="q"
              name="q"
              type="search"
              placeholder="Search everything"
              autocomplete="off"
              .value=${props.query ?? ''}
            />
            <button type="submit">Search</button>
          </form>
        </search>
        <nav class="utility" aria-label="Account and cart">
          ${accountLinks(props.account)}
          <!-- The document shell slots <shop-mini-cart> here. It must stay in the light DOM:
               Gyral components nested in another component's server-rendered shadow root get
               defer-hydration, and Gyral then never wires their intents (Gyral bug, reported). -->
          <slot name="cart"><a href="/cart">Cart</a></slot>
        </nav>
      </div>
      <nav class="departments" aria-label="Departments">
        <ul>
          ${repeat(
            props.departments ?? [],
            (d) => d.slug,
            (d) =>
              html`<li>
                <a href="/d/${d.slug}" aria-current=${d.slug === props.current ? 'true' : nothing}
                  >${d.name}</a
                >
              </li>`,
          )}
        </ul>
      </nav>
    </header>
  `,
  styles: css`
    :host {
      display: block;
      background: var(--brand);
      color: var(--brand-ink);
    }
    .bar,
    .departments ul {
      inline-size: min(100% - 2 * var(--space-3), var(--page-max));
      margin-inline: auto;
    }
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
      padding-block: var(--space-2);
    }
    .brand {
      font-weight: 800;
      font-size: 1.4rem;
      text-decoration: none;
      color: inherit;
      letter-spacing: -0.02em;
    }
    .brand span {
      font-weight: 400;
    }
    search {
      flex: 1 1 18rem;
    }
    form {
      display: flex;
    }
    input {
      flex: 1;
      min-inline-size: 0;
      font: inherit;
      padding: var(--space-2) var(--space-3);
      border: 0;
      border-start-start-radius: var(--radius);
      border-end-start-radius: var(--radius);
      background: var(--surface-raised);
      color: var(--ink);
    }
    button {
      font: inherit;
      font-weight: 600;
      padding-inline: var(--space-3);
      border: 0;
      border-start-end-radius: var(--radius);
      border-end-end-radius: var(--radius);
      background: oklch(from var(--brand) calc(l - 0.15) c h);
      color: inherit;
      cursor: pointer;
    }
    .utility {
      display: flex;
      gap: var(--space-3);
    }
    a {
      color: inherit;
    }
    .departments {
      background: oklch(from var(--brand) calc(l - 0.08) c h);
    }
    .departments ul {
      list-style: none;
      display: flex;
      gap: var(--space-3);
      overflow-x: auto;
      padding-block: var(--space-2);
      padding-inline: 0;
      margin-block: 0;
      scrollbar-width: thin;
    }
    .departments a {
      white-space: nowrap;
      text-decoration: none;
      font-weight: 500;
    }
    .departments a:hover,
    .departments a[aria-current] {
      text-decoration: underline;
    }
    .departments a[aria-current] {
      font-weight: 700;
      text-underline-offset: 0.3em;
    }
    .account-menu {
      position: relative;
    }
    .account-menu summary {
      cursor: pointer;
      list-style-position: inside;
    }
    .account-menu ul {
      position: absolute;
      inset-inline-end: 0;
      inset-block-start: calc(100% + var(--space-1));
      z-index: 10;
      min-inline-size: 12rem;
      margin: 0;
      padding: var(--space-2);
      list-style: none;
      display: grid;
      gap: var(--space-1);
      background: var(--surface-raised);
      color: var(--ink);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: 0 0.5rem 1.5rem oklch(0% 0 0 / 0.15);
    }
    .account-menu ul a,
    .account-menu ul button {
      display: block;
      inline-size: 100%;
      padding: var(--space-1) var(--space-2);
      text-align: start;
      color: inherit;
      border-radius: calc(var(--radius) / 2);
    }
    .account-menu ul button {
      font: inherit;
      background: none;
      border: 0;
      cursor: pointer;
    }
    .account-menu ul a:hover,
    .account-menu ul button:hover {
      background: var(--surface-sunken);
    }
    .account-menu ul :focus-visible {
      outline-color: var(--focus);
    }
    :focus-visible {
      outline: 2px solid var(--brand-ink);
      outline-offset: 2px;
    }
    .visually-hidden {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-header': InstanceType<typeof SiteHeader>;
  }
}

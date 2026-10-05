import { define, html, nothing, repeat, send, type Stateless } from '@gyral/core';
import '../cart/mini-cart.js';
import './search-box.js';
import { loadedMe, meStore } from '../me/store.js';
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
  readonly departments: readonly DepartmentLink[];
  /** The current search query, echoed in the search box. */
  readonly query?: string;
  /** Slug of the department being browsed, marked as the current link. */
  readonly current?: string;
  /** Set when a member is signed in. */
  readonly account?: AccountSummary;
  /**
   * The page was prerendered for everyone (ssg): after hydration, ask the server who is
   * signed in (`GET /api/me`) instead of trusting the static HTML.
   */
  readonly personalize?: boolean;
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
    : html`<details class="account-menu" data-component="account-menu">
        <summary>Hi, ${account.firstName}</summary>
        <ul>
          <li><a href="/account">Your account</a></li>
          <li><a href="/account/orders">Your orders</a></li>
          <li>
            <form method="post" action="/account/logout">
              ${csrfField(account.csrfToken)}
              <button type="submit">Sign out</button>
            </form>
          </li>
        </ul>
      </details>`;

export const SiteHeader = define<Stateless, never, HeaderProps>('shop-header', {
  stores: [meStore],
  props: {
    departments: { attribute: false, default: [] },
    query: { type: String },
    current: { type: String },
    account: { attribute: false },
    personalize: { type: Boolean },
  },
  intent: {},
  update: {
    // Static pages: ask the shared visitor store (one /api/me request per page, shop-7bj).
    Hydrated: (s, _m, { props }) =>
      props.personalize === true ? [s, [send(meStore, { _tag: 'Load' })]] : s,
  },
  // Light DOM (ADR 0006 rule 5): themes re-lay out the header with document CSS
  // (src/ui/styles/header.ts). Search and mini-cart are nested components; Gyral hydrates
  // light-DOM children in place and keeps their seeds (Gyral ADR 0014 addendum).
  shadow: false,
  view: (_s, _i, { props, read }) => html`
    <header data-region="header">
      <div class="bar" data-region="masthead">
        <a class="brand" href="/" aria-label="Gyral Goods home" data-component="brand"
          >Gyral <span>Goods</span></a
        >
        <shop-search query=${props.query ?? ''}></shop-search>
        <nav class="utility" aria-label="Account and cart" data-region="account">
          ${accountLinks(props.account ?? loadedMe(read(meStore))?.account ?? undefined)}
          <shop-mini-cart data-region="cart"></shop-mini-cart>
        </nav>
      </div>
      <nav class="departments" aria-label="Departments" data-region="nav">
        <ul>
          ${repeat(
            props.departments,
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
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-header': InstanceType<typeof SiteHeader>;
  }
}

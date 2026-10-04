import { css, define, html, repeat, type Stateless } from '@gyral/core';

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
}

/**
 * The site header: brand, search, account and cart entry points, department navigation.
 * Every part works without JavaScript (links and a GET form). Account and cart slots are
 * placeholders until the accounts and cart epics land.
 */
export const SiteHeader = define<Stateless, never, HeaderProps>('shop-header', {
  props: {
    departments: { attribute: false },
    query: { type: String },
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
          <a href="/account/login">Sign in</a>
          <a href="/cart">Cart</a>
        </nav>
      </div>
      <nav class="departments" aria-label="Departments">
        <ul>
          ${repeat(
            props.departments ?? [],
            (d) => d.slug,
            (d) => html`<li><a href="/d/${d.slug}">${d.name}</a></li>`,
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
    .departments a:hover {
      text-decoration: underline;
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

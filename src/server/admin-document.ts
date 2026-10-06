// The admin's own document shell (docs/product-specs/admin.md): no storefront header, cart,
// consent banner or footer, just an admin header with a link back to the store and sign-out.
// The page itself is the client-rendered <shop-admin> app; the shell is server-only.
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import { CSRF_META, csrfField } from '../ui/forms/csrf.js';
import { documentTitle, SITE_NAME } from '../ui/layout/site.js';
import { adminCss } from '../ui/styles/admin.js';
import { baseCss } from '../ui/styles/base.js';
import { ordersCss } from '../ui/styles/orders.js';

export interface AdminShellOptions {
  readonly clientEntry: string;
  readonly modulepreload?: readonly string[];
  readonly title: string;
  readonly csrfToken: string;
  /** The signed-in admin's name, shown in the header. */
  readonly name: string;
  readonly main: unknown;
  readonly status?: number;
}

/** Order status badges reuse the storefront's order styles. */
const ADMIN_STYLES = [baseCss, ordersCss, adminCss, adminShellCss()];

function adminShellCss(): string {
  return `
@layer components {
  .admin-header {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
    align-items: center;
    justify-content: space-between;
    padding-block: var(--space-2);
    padding-inline: var(--space-3);
    border-block-end: 1px solid var(--line);
    background: var(--surface-raised);
  }
  .admin-header p { margin: 0; }
  .admin-header .admin-site { font-weight: 700; }
  .admin-header nav ul {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .admin-header form { display: inline; }
  .admin-header button {
    font: inherit;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
}`;
}

export function adminShell(options: AdminShellOptions): Response {
  return renderPage(
    {
      title: documentTitle(options.title),
      styles: ADMIN_STYLES,
      head: html`<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <meta name="robots" content="noindex" />
        <meta name=${CSRF_META} content=${options.csrfToken} />`,
      body: html`
        <nav class="skip-links" aria-label="Skip links">
          <a class="skip-link" href="#main">Skip to content</a>
        </nav>
        <header class="admin-header" data-region="admin-header">
          <p class="admin-site">${SITE_NAME} admin</p>
          <nav aria-label="Account">
            <ul>
              <li><a href="/" data-component="admin-store-link">View the store</a></li>
              <li data-component="admin-account">Signed in as ${options.name}</li>
              <li>
                <form method="post" action="/account/logout" data-component="admin-sign-out">
                  ${csrfField(options.csrfToken)}
                  <button type="submit">Sign out</button>
                </form>
              </li>
            </ul>
          </nav>
        </header>
        <main id="main" class="page" tabindex="-1">${options.main}</main>
      `,
      scripts: [options.clientEntry],
      modulepreload: options.modulepreload ?? [],
    },
    { status: options.status ?? 200 },
  );
}

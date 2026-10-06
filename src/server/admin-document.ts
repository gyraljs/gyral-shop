// The admin's own document shell (docs/product-specs/admin.md): no storefront header, cart,
// consent banner or footer, just an admin header with a link back to the store and sign-out.
// The page itself is the client-rendered <shop-admin> app; the shell is server-only.
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import { CSRF_META, csrfField } from '../ui/forms/csrf.js';
import { documentTitle, SITE_NAME } from '../ui/layout/site.js';
import { ADMIN_STYLES } from './page-styles.js';

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

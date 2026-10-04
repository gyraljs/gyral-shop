// The server-only document shell: head, skip link, header, main, footer (lit-web-apps skill:
// document.ts). Only the custom elements inside hydrate; the shell itself never does.
import { html, nothing } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { DepartmentLink } from '../ui/layout/site-header.js';
import '../ui/layout/site-header.js'; // registers <shop-header> for server rendering
import { baseCss } from '../ui/styles/base.js';

export const SITE_NAME = 'Gyral Goods';

export interface ShellOptions {
  /** URL of the browser entry module (Vite dev: a source path; prod: a built asset). */
  readonly clientEntry: string;
  readonly title: string;
  readonly description?: string;
  readonly departments: readonly DepartmentLink[];
  readonly query?: string;
  /** The page's main content (a Lit template, usually one page component). */
  readonly main: unknown;
  readonly status?: number;
  /** Account, cart, checkout and admin pages are not for search engines (SEO spec). */
  readonly noindex?: boolean;
}

const footer = html`
  <footer class="site-footer">
    <div class="page">
      <nav aria-label="Site">
        <ul>
          <li><a href="/about">About</a></li>
          <li><a href="/faq">FAQ</a></li>
          <li><a href="/contact">Contact</a></li>
          <li><a href="/terms">Terms</a></li>
          <li><a href="/privacy">Privacy</a></li>
        </ul>
      </nav>
      <p>
        <small>© 2026 ${SITE_NAME}. A demo store built with Gyral; nothing here is for sale.</small>
      </p>
    </div>
  </footer>
`;

export function shell(options: ShellOptions): Response {
  const head = html`${unsafeHTML(`<style>${baseCss}</style>`)}
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    ${options.noindex === true ? html`<meta name="robots" content="noindex" />` : nothing}`;
  return renderPage(
    {
      title: options.title === SITE_NAME ? SITE_NAME : `${options.title} — ${SITE_NAME}`,
      ...(options.description === undefined ? {} : { description: options.description }),
      head,
      body: html`
        <a class="skip-link" href="#main">Skip to content</a>
        <shop-header .departments=${options.departments} query=${options.query ?? ''}></shop-header>
        <main id="main" class="page" tabindex="-1">${options.main}</main>
        ${footer}
      `,
      scripts: [options.clientEntry],
    },
    { status: options.status ?? 200 },
  );
}

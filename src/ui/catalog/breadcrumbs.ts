import { html } from '@gyral/core';

/** One step of a breadcrumb trail. The last step is the current page and has no link. */
export interface Crumb {
  readonly name: string;
  /** Site-relative path, e.g. `/d/electronics`. Omitted for the current page. */
  readonly path?: string;
}

/** Breadcrumb navigation (WAI-ARIA breadcrumb pattern). JSON-LD is added by the server. */
export const breadcrumbs = (trail: readonly Crumb[]) => html`
  <nav class="breadcrumbs" aria-label="Breadcrumb">
    <ol>
      ${trail.map((crumb) =>
        crumb.path === undefined
          ? html`<li><span aria-current="page">${crumb.name}</span></li>`
          : html`<li><a href=${crumb.path}>${crumb.name}</a></li>`,
      )}
    </ol>
  </nav>
`;

import { html } from '@gyral/core';

/** One step of a breadcrumb trail. The last step is the current page and has no link. */
export interface Crumb {
  readonly name: string;
  /** Site-relative path, e.g. `/d/electronics`. Omitted for the current page. */
  readonly path?: string;
}

/**
 * `BreadcrumbList` structured data for a trail. The current page (the crumb without a path)
 * uses `currentPath`, so every item has an absolute URL. Shared by the server's page heads and
 * <shop-listing>'s head after updates without a reload (listing-head.ts).
 */
export function breadcrumbJsonLd(origin: string, trail: readonly Crumb[], currentPath: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: new URL(crumb.path ?? currentPath, origin).href,
    })),
  };
}

/** Breadcrumb navigation (WAI-ARIA breadcrumb pattern); its JSON-LD is in the page's head. */
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

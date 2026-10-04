// Structured data builders (google-seo-fundamentals skill; docs/product-specs/seo.md).
import type { Crumb } from '../ui/catalog/breadcrumbs.js';

/**
 * `BreadcrumbList` for a trail. The current page (the crumb without a path) uses
 * `currentPath`, so every item has an absolute URL.
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

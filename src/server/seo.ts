// Structured data builders (google-seo-fundamentals skill; docs/product-specs/seo.md).
import type { ProductPageData } from '../services/product.js';
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

const offerPrice = (v: ProductPageData['variants'][number]) =>
  v.salePriceCents !== null && v.salePriceCents < v.priceCents ? v.salePriceCents : v.priceCents;
const dollars = (cents: number) => (cents / 100).toFixed(2);
const IN_STOCK = 'https://schema.org/InStock';
const OUT_OF_STOCK = 'https://schema.org/OutOfStock';

/**
 * `Product` with offers and aggregate rating (Google product snippets). One SKU gives an
 * `Offer`; several give an `AggregateOffer` over their price range.
 */
export function productJsonLd(origin: string, product: ProductPageData, path: string) {
  const url = new URL(path, origin).href;
  const prices = product.variants.map(offerPrice);
  const inStock = product.variants.some((v) => v.stock > 0);
  const [only] = product.variants;
  const offers =
    product.variants.length === 1 && only !== undefined
      ? {
          '@type': 'Offer',
          url,
          sku: only.sku,
          price: dollars(offerPrice(only)),
          priceCurrency: 'USD',
          availability: only.stock > 0 ? IN_STOCK : OUT_OF_STOCK,
          itemCondition: 'https://schema.org/NewCondition',
        }
      : {
          '@type': 'AggregateOffer',
          url,
          lowPrice: dollars(Math.min(...prices)),
          highPrice: dollars(Math.max(...prices)),
          offerCount: product.variants.length,
          priceCurrency: 'USD',
          availability: inStock ? IN_STOCK : OUT_OF_STOCK,
        };
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    url,
    image: product.images.map((image) => new URL(image.url, origin).href),
    brand: { '@type': 'Brand', name: product.brand },
    ...(only !== undefined && product.variants.length === 1 ? { sku: only.sku } : {}),
    offers,
    ...(product.rating.average === null
      ? {}
      : {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.rating.average.toFixed(1),
            reviewCount: product.rating.count,
            bestRating: '5',
            worstRating: '1',
          },
        }),
  };
}

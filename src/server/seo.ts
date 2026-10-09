// Structured data builders (google-seo-fundamentals skill; docs/product-specs/seo.md).
import type { ProductPageData } from '../services/product.js';

export { breadcrumbJsonLd } from '../ui/catalog/breadcrumbs.js';

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

/** `Organization` for the home page (logo and name for knowledge panels). */
export function organizationJsonLd(origin: string, name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    url: new URL('/', origin).href,
    logo: new URL('/favicon.svg', origin).href,
  };
}

/** `WebSite` with a `SearchAction`, so search engines can offer a site search box. */
export function websiteJsonLd(origin: string, name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    url: new URL('/', origin).href,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${new URL('/search', origin).href}?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** Twitter (X) card tags; they fall back to Open Graph for anything not set here. */
export function twitterCard(image: string | undefined): (readonly [string, string])[] {
  return [['twitter:card', image === undefined ? 'summary' : 'summary_large_image']];
}

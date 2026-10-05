// Product page use-case (docs/product-specs/product-page.md). Returns plain data (cents,
// ISO dates) so it can be rendered on the server and seeded into hydrating components.
import type { Db } from '../db/client.js';
import { productCards } from '../db/repos/catalog.js';
import { findProduct, ratingDistribution, topReviews } from '../db/repos/product.js';
import { toCard, type Card } from './catalog.js';

/** One SKU as the buy box needs it. A variant price override has no sale price. */
export interface VariantView {
  readonly sku: string;
  readonly options: Readonly<Record<string, string>>;
  readonly priceCents: number;
  readonly salePriceCents: number | null;
  readonly stock: number;
}

export interface ReviewView {
  readonly id: number;
  readonly rating: number;
  readonly title: string;
  readonly body: string;
  /** First name and last initial only. */
  readonly author: string;
  /** ISO date (YYYY-MM-DD). */
  readonly date: string;
}

export interface RatingSummary {
  /** Average to one decimal, or null when unrated. */
  readonly average: number | null;
  readonly count: number;
  /** Review counts for 5, 4, 3, 2 and 1 stars, in that order. */
  readonly distribution: readonly { readonly stars: number; readonly count: number }[];
}

export interface ProductPageData {
  readonly slug: string;
  readonly name: string;
  readonly brand: string;
  readonly description: string;
  readonly specs: readonly (readonly [string, string])[];
  readonly department: { readonly slug: string; readonly name: string };
  readonly category: { readonly slug: string; readonly name: string };
  readonly images: readonly { readonly url: string; readonly alt: string }[];
  readonly variants: readonly VariantView[];
  readonly rating: RatingSummary;
  readonly reviews: readonly ReviewView[];
  readonly related: readonly Card[];
}

export const REVIEWS_SHOWN = 5;
export const RELATED_SHOWN = 4;

/** "Jane Doe" → "Jane D.": reviews never show a full name. */
export const reviewerName = (name: string): string => {
  const [first = '', ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last === undefined ? first : `${first} ${last.charAt(0)}.`;
};

export async function productPage(db: Db, slug: string): Promise<ProductPageData | undefined> {
  const detail = await findProduct(db, slug);
  if (detail === undefined) return undefined;
  const { product } = detail;
  const [distribution, reviewRows, relatedRows] = await Promise.all([
    ratingDistribution(db, product.id),
    topReviews(db, product.id, REVIEWS_SHOWN),
    // One extra, in case the product itself is among the category's best.
    productCards(db, {
      categoryId: product.category.id,
      order: 'rating',
      limit: RELATED_SHOWN + 1,
    }),
  ]);
  return {
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    description: product.description,
    specs: product.specs ?? [],
    department: { slug: product.department.slug, name: product.department.name },
    category: { slug: product.category.slug, name: product.category.name },
    images: detail.images,
    variants: detail.variants.map((v) => ({
      sku: v.sku,
      options: v.options,
      priceCents: v.priceCents ?? product.priceCents,
      salePriceCents: v.priceCents === null ? product.salePriceCents : null,
      stock: Math.max(0, v.stock),
    })),
    rating: {
      average:
        product.ratingCount === 0
          ? null
          : Math.round((product.ratingSum / product.ratingCount) * 10) / 10,
      count: product.ratingCount,
      distribution: [5, 4, 3, 2, 1].map((stars) => ({
        stars,
        count: distribution.get(stars) ?? 0,
      })),
    },
    reviews: reviewRows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      author: reviewerName(r.author),
      date: r.createdAt.toISOString().slice(0, 10),
    })),
    related: relatedRows
      .filter((row) => row.slug !== product.slug)
      .slice(0, RELATED_SHOWN)
      .map(toCard),
  };
}

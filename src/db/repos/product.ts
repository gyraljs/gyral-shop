// Product page reads (docs/product-specs/product-page.md). Kept apart from listing queries.
import { and, asc, count, desc, eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import {
  brands,
  categories,
  departments,
  productImages,
  products,
  reviews,
  users,
  variants,
} from '../schema.js';

export interface ProductRow {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly brand: string;
  readonly priceCents: number;
  readonly salePriceCents: number | null;
  readonly ratingSum: number;
  readonly ratingCount: number;
  readonly specs: readonly (readonly [string, string])[] | null;
  readonly department: { readonly id: number; readonly slug: string; readonly name: string };
  readonly category: { readonly id: number; readonly slug: string; readonly name: string };
}

export interface VariantRow {
  readonly sku: string;
  readonly options: Readonly<Record<string, string>>;
  readonly priceCents: number | null;
  readonly stock: number;
}

export interface ImageRow {
  readonly url: string;
  readonly alt: string;
}

export interface ProductDetail {
  readonly product: ProductRow;
  readonly variants: readonly VariantRow[];
  readonly images: readonly ImageRow[];
}

/** A listed (non-archived) product with its variants and images, by slug. */
export async function findProduct(db: Db, slug: string): Promise<ProductDetail | undefined> {
  const [product] = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      description: products.description,
      brand: brands.name,
      priceCents: products.priceCents,
      salePriceCents: products.salePriceCents,
      ratingSum: products.ratingSum,
      ratingCount: products.ratingCount,
      specs: products.specs,
      department: { id: departments.id, slug: departments.slug, name: departments.name },
      category: { id: categories.id, slug: categories.slug, name: categories.name },
    })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(departments, eq(departments.id, products.departmentId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.slug, slug), eq(products.archived, false)));
  if (product === undefined) return undefined;
  const [variantRows, imageRows] = await Promise.all([
    db
      .select({
        sku: variants.sku,
        options: variants.options,
        priceCents: variants.priceCents,
        stock: variants.stock,
      })
      .from(variants)
      .where(eq(variants.productId, product.id))
      .orderBy(asc(variants.position), asc(variants.id)),
    db
      .select({ url: productImages.url, alt: productImages.alt })
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(asc(productImages.position), asc(productImages.id)),
  ]);
  return { product, variants: variantRows, images: imageRows };
}

/** How many visible reviews gave each star rating, keyed 1–5. */
export async function ratingDistribution(db: Db, productId: number): Promise<Map<number, number>> {
  const rows = await db
    .select({ rating: reviews.rating, n: count() })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.hidden, false)))
    .groupBy(reviews.rating);
  return new Map(rows.map((r) => [r.rating, r.n]));
}

export interface ReviewRow {
  readonly id: number;
  readonly rating: number;
  readonly title: string;
  readonly body: string;
  readonly author: string;
  readonly createdAt: Date;
  readonly helpfulCount: number;
}

/** The most helpful visible reviews first, then the newest. */
export function topReviews(db: Db, productId: number, limit: number): Promise<ReviewRow[]> {
  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      title: reviews.title,
      body: reviews.body,
      author: users.name,
      createdAt: reviews.createdAt,
      helpfulCount: reviews.helpfulCount,
    })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.userId))
    .where(and(eq(reviews.productId, productId), eq(reviews.hidden, false)))
    .orderBy(desc(reviews.helpfulCount), desc(reviews.createdAt), desc(reviews.id))
    .limit(limit);
}

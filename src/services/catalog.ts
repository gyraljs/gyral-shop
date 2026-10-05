// Catalog use-cases: shape repository rows for pages. Plain data (cents, not Money objects)
// so it serializes into hydration seeds unchanged.
import type { Db } from '../db/client.js';
import { listDepartments, productCards, type ProductCardRow } from '../db/repos/catalog.js';
import { MIN_REVIEWS_FOR_TOP_RATED } from '../domain/ratings.js';

export interface Card {
  readonly slug: string;
  readonly name: string;
  readonly brand: string;
  readonly priceCents: number;
  readonly salePriceCents: number | null;
  /** Average to one decimal, or null when unrated. */
  readonly rating: number | null;
  readonly ratingCount: number;
  readonly image: { readonly url: string; readonly alt: string } | null;
  readonly inStock: boolean;
}

export interface DepartmentLink {
  readonly slug: string;
  readonly name: string;
}

export const toCard = (row: ProductCardRow): Card => ({
  slug: row.slug,
  name: row.name,
  brand: row.brand,
  priceCents: row.priceCents,
  salePriceCents: row.salePriceCents,
  rating: row.ratingCount === 0 ? null : Math.round((row.ratingSum / row.ratingCount) * 10) / 10,
  ratingCount: row.ratingCount,
  image: row.imageUrl === null ? null : { url: row.imageUrl, alt: row.imageAlt ?? row.name },
  inStock: row.stock > 0,
});

export async function departmentLinks(db: Db): Promise<DepartmentLink[]> {
  const rows = await listDepartments(db);
  return rows.map(({ slug, name }) => ({ slug, name }));
}

/** A department tile on the home page: its description and a representative image. */
export interface FeaturedDepartment {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly image: { readonly url: string; readonly alt: string } | null;
}

export interface HomeData {
  readonly featured: readonly FeaturedDepartment[];
  readonly deals: readonly Card[];
  readonly topRated: readonly Card[];
  readonly bestSellers: readonly Card[];
  readonly newArrivals: readonly Card[];
}

const TOP_RATED = { order: 'top-rated', minReviews: MIN_REVIEWS_FOR_TOP_RATED } as const;

export async function homeData(db: Db): Promise<HomeData> {
  const departments = await listDepartments(db);
  const [deals, topRated, bestSellers, newArrivals, covers] = await Promise.all([
    productCards(db, { onSale: true, order: 'top-rated', limit: 8 }),
    productCards(db, { ...TOP_RATED, limit: 8 }),
    productCards(db, { order: 'popular', limit: 8 }),
    productCards(db, { order: 'newest', limit: 8 }),
    // Each department's best-rated product image stands in for a department photo.
    Promise.all(
      departments.map((d) => productCards(db, { departmentId: d.id, ...TOP_RATED, limit: 1 })),
    ),
  ]);
  return {
    featured: departments.map((d, n) => {
      const cover = covers[n]?.[0];
      return {
        slug: d.slug,
        name: d.name,
        description: d.description,
        image: cover?.imageUrl == null ? null : { url: cover.imageUrl, alt: '' },
      };
    }),
    deals: deals.map(toCard),
    topRated: topRated.map(toCard),
    bestSellers: bestSellers.map(toCard),
    newArrivals: newArrivals.map(toCard),
  };
}

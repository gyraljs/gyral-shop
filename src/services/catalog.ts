// Catalog use-cases: shape repository rows for pages. Plain data (cents, not Money objects)
// so it serializes into hydration seeds unchanged.
import type { Db } from '../db/client.js';
import { listDepartments, productCards, type ProductCardRow } from '../db/repos/catalog.js';

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

export interface HomeData {
  readonly deals: readonly Card[];
  readonly topRated: readonly Card[];
  readonly newArrivals: readonly Card[];
}

export async function homeData(db: Db): Promise<HomeData> {
  const [deals, topRated, newArrivals] = await Promise.all([
    productCards(db, { onSale: true, order: 'rating', limit: 8 }),
    productCards(db, { order: 'rating', limit: 8 }),
    productCards(db, { order: 'newest', limit: 8 }),
  ]);
  return {
    deals: deals.map(toCard),
    topRated: topRated.map(toCard),
    newArrivals: newArrivals.map(toCard),
  };
}

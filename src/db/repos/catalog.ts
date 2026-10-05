// Catalog reads. Repositories return plain rows; services and pages shape them further.
import { and, asc, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client.js';
import { brands, categories, departments, productImages, products, variants } from '../schema.js';
import { matchesSearch, searchRank } from './search.js';

export interface DepartmentRow {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
}

export interface CategoryRow {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
}

export interface ProductCardRow {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly brand: string;
  readonly priceCents: number;
  readonly salePriceCents: number | null;
  readonly ratingSum: number;
  readonly ratingCount: number;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
  readonly stock: number;
}

const departmentColumns = {
  id: departments.id,
  slug: departments.slug,
  name: departments.name,
  description: departments.description,
};

export function listDepartments(db: Db): Promise<DepartmentRow[]> {
  return db
    .select(departmentColumns)
    .from(departments)
    .orderBy(asc(departments.position), asc(departments.name));
}

export async function findDepartment(
  db: Db,
  slug: string,
): Promise<(DepartmentRow & { readonly categories: CategoryRow[] }) | undefined> {
  const [department] = await db
    .select(departmentColumns)
    .from(departments)
    .where(eq(departments.slug, slug));
  if (department === undefined) return undefined;
  const rows = await db
    .select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(categories)
    .where(eq(categories.departmentId, department.id))
    .orderBy(asc(categories.position), asc(categories.name));
  return { ...department, categories: rows };
}

/** A category by its department and category slugs, with its department. */
export async function findCategory(
  db: Db,
  departmentSlug: string,
  categorySlug: string,
): Promise<{ readonly department: DepartmentRow; readonly category: CategoryRow } | undefined> {
  const [row] = await db
    .select({
      department: departmentColumns,
      category: { id: categories.id, slug: categories.slug, name: categories.name },
    })
    .from(categories)
    .innerJoin(departments, eq(departments.id, categories.departmentId))
    .where(and(eq(departments.slug, departmentSlug), eq(categories.slug, categorySlug)));
  return row;
}

// First image by position, and stock summed over variants, as correlated subqueries.
const firstImage = (column: 'url' | 'alt') =>
  sql<string | null>`(select ${sql.identifier(column)} from ${productImages}
    where ${productImages.productId} = ${products.id}
    order by ${productImages.position} limit 1)`;
const totalStock = sql<number>`(select coalesce(sum(${variants.stock}), 0) from ${variants}
  where ${variants.productId} = ${products.id})`;
/** The price a shopper pays: the sale price when there is one. */
const paidPrice = sql<number>`coalesce(${products.salePriceCents}, ${products.priceCents})`;
const averageRating = sql<number>`${products.ratingSum} * 1.0 / max(${products.ratingCount}, 1)`;

/** Which products a listing contains (catalog spec: listing filters). */
export interface ProductFilter {
  readonly departmentId?: number;
  readonly categoryId?: number;
  readonly onSale?: boolean;
  /** Bounds on the price a shopper pays (the sale price when there is one), inclusive. */
  readonly minPriceCents?: number;
  readonly maxPriceCents?: number;
  /** Brand slugs; empty or absent means every brand. */
  readonly brandSlugs?: readonly string[];
  /** Minimum average rating; unrated products never match. */
  readonly minRating?: number;
  /** Only products with stock in at least one variant. */
  readonly inStock?: boolean;
  /** An FTS5 expression from `ftsMatch()` (search.ts): only products matching it. */
  readonly match?: string;
}

export type CardOrder = 'newest' | 'rating' | 'price-asc' | 'price-desc' | 'relevance';

export interface CardQuery extends ProductFilter {
  /** `relevance` ranks by rating when browsing, and by search rank when `match` is set. */
  readonly order?: CardOrder;
  readonly limit: number;
  readonly offset?: number;
}

/** The WHERE clause for a filter. Shared by card queries and counts so they always agree. */
function where(filter: ProductFilter): SQL | undefined {
  const filters: SQL[] = [eq(products.archived, false)];
  if (filter.departmentId !== undefined)
    filters.push(eq(products.departmentId, filter.departmentId));
  if (filter.categoryId !== undefined) filters.push(eq(products.categoryId, filter.categoryId));
  if (filter.onSale === true) filters.push(sql`${products.salePriceCents} is not null`);
  if (filter.minPriceCents !== undefined)
    filters.push(sql`${paidPrice} >= ${filter.minPriceCents}`);
  if (filter.maxPriceCents !== undefined)
    filters.push(sql`${paidPrice} <= ${filter.maxPriceCents}`);
  if (filter.brandSlugs !== undefined && filter.brandSlugs.length > 0) {
    filters.push(
      sql`${products.brandId} in (select ${brands.id} from ${brands} where ${inArray(brands.slug, [...filter.brandSlugs])})`,
    );
  }
  if (filter.minRating !== undefined) {
    filters.push(sql`${products.ratingCount} > 0 and ${averageRating} >= ${filter.minRating}`);
  }
  if (filter.inStock === true) filters.push(sql`${totalStock} > 0`);
  if (filter.match !== undefined) filters.push(matchesSearch(filter.match));
  return and(...filters);
}

/** How many products match a filter (for pagination). */
export async function countProducts(db: Db, filter: ProductFilter): Promise<number> {
  const [row] = await db.select({ n: count() }).from(products).where(where(filter));
  return row?.n ?? 0;
}

/** Product counts per category of one department, keyed by category id. */
export async function categoryCounts(db: Db, departmentId: number): Promise<Map<number, number>> {
  const rows = await db
    .select({ categoryId: products.categoryId, n: count() })
    .from(products)
    .where(where({ departmentId }))
    .groupBy(products.categoryId);
  return new Map(rows.map((r) => [r.categoryId, r.n]));
}

function orderBy(order: CardOrder | undefined, match: string | undefined): SQL[] {
  if (order === 'relevance' && match !== undefined) {
    return [asc(searchRank(match)), desc(averageRating), asc(products.id)];
  }
  switch (order) {
    case 'rating':
    case 'relevance':
      return [desc(averageRating), asc(products.id)];
    case 'price-asc':
      return [asc(paidPrice), asc(products.id)];
    case 'price-desc':
      return [desc(paidPrice), asc(products.id)];
    case 'newest':
    case undefined:
      return [desc(products.createdAt), desc(products.id)];
  }
}

export interface BrandFacetRow {
  readonly slug: string;
  readonly name: string;
  /** Matching products of this brand, with every filter except brand applied. */
  readonly count: number;
}

/** Brands present in a listing, for the brand filter. Ignores the brand filter itself. */
export function brandFacets(db: Db, filter: ProductFilter): Promise<BrandFacetRow[]> {
  return db
    .select({ slug: brands.slug, name: brands.name, count: count() })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(where({ ...filter, brandSlugs: [] }))
    .groupBy(brands.id)
    .orderBy(asc(brands.name));
}

export function productCards(db: Db, query: CardQuery): Promise<ProductCardRow[]> {
  const order = orderBy(query.order, query.match);
  return db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      brand: brands.name,
      priceCents: products.priceCents,
      salePriceCents: products.salePriceCents,
      ratingSum: products.ratingSum,
      ratingCount: products.ratingCount,
      imageUrl: firstImage('url'),
      imageAlt: firstImage('alt'),
      stock: totalStock,
    })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(where(query))
    .orderBy(...order)
    .limit(query.limit)
    .offset(query.offset ?? 0);
}

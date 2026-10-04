// Catalog reads. Repositories return plain rows; services and pages shape them further.
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client.js';
import { brands, categories, departments, productImages, products, variants } from '../schema.js';

export interface DepartmentRow {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
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

export function listDepartments(db: Db): Promise<DepartmentRow[]> {
  return db
    .select({ id: departments.id, slug: departments.slug, name: departments.name })
    .from(departments)
    .orderBy(asc(departments.position), asc(departments.name));
}

export async function findDepartment(
  db: Db,
  slug: string,
): Promise<(DepartmentRow & { readonly categories: CategoryRow[] }) | undefined> {
  const [department] = await db
    .select({ id: departments.id, slug: departments.slug, name: departments.name })
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

// First image by position, and stock summed over variants, as correlated subqueries.
const firstImage = (column: 'url' | 'alt') =>
  sql<string | null>`(select ${sql.identifier(column)} from ${productImages}
    where ${productImages.productId} = ${products.id}
    order by ${productImages.position} limit 1)`;
const totalStock = sql<number>`(select coalesce(sum(${variants.stock}), 0) from ${variants}
  where ${variants.productId} = ${products.id})`;

export interface CardQuery {
  readonly departmentId?: number;
  readonly categoryId?: number;
  readonly onSale?: boolean;
  readonly order?: 'newest' | 'rating';
  readonly limit: number;
  readonly offset?: number;
}

export function productCards(db: Db, query: CardQuery): Promise<ProductCardRow[]> {
  const filters: SQL[] = [eq(products.archived, false)];
  if (query.departmentId !== undefined) filters.push(eq(products.departmentId, query.departmentId));
  if (query.categoryId !== undefined) filters.push(eq(products.categoryId, query.categoryId));
  if (query.onSale === true) filters.push(sql`${products.salePriceCents} is not null`);
  const order =
    query.order === 'rating'
      ? [desc(sql`${products.ratingSum} * 1.0 / max(${products.ratingCount}, 1)`), asc(products.id)]
      : [desc(products.createdAt), desc(products.id)];
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
    .where(and(...filters))
    .orderBy(...order)
    .limit(query.limit)
    .offset(query.offset ?? 0);
}

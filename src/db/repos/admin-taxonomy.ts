// Departments, categories and brands (admin). The search index copies these names into every
// product's row; triggers (drizzle/0006_taxonomy_reindex.sql) keep it in sync on rename.
// Archived ones are hidden from shoppers; archiving is refused while live products use them.
import { and, asc, count, eq, sql } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { Db } from '../client.js';
import { brands, categories, departments, products } from '../schema.js';
import type { Tx } from '../tx.js';

type Reader = Db | Tx;

export type TaxonKind = 'department' | 'category' | 'brand';

const TABLES = { department: departments, category: categories, brand: brands } as const;

const COLUMN = {
  department: products.departmentId,
  category: products.categoryId,
  brand: products.brandId,
} as const;

export async function renameTaxon(
  tx: Tx,
  kind: TaxonKind,
  id: number,
  name: string,
): Promise<boolean> {
  const table = TABLES[kind];
  const updated = await tx
    .update(table)
    .set({ name })
    .where(eq(table.id, id))
    .returning({ id: table.id });
  return updated.length > 0;
}

/** Live (not archived) product counts per value of `column`. */
async function liveCounts(db: Reader, column: SQLiteColumn): Promise<ReadonlyMap<number, number>> {
  const rows = await db
    .select({ id: sql<number>`${column}`, n: count() })
    .from(products)
    .where(eq(products.archived, false))
    .groupBy(column);
  return new Map(rows.map((r) => [r.id, r.n]));
}

/** Everything, including archived entries, with live product counts. */
export async function taxonomyTree(db: Reader) {
  const [deps, cats, brandRows, byDepartment, byCategory, byBrand] = await Promise.all([
    db
      .select({
        id: departments.id,
        slug: departments.slug,
        name: departments.name,
        archived: departments.archived,
      })
      .from(departments)
      .orderBy(asc(departments.position), asc(departments.name)),
    db
      .select({
        id: categories.id,
        departmentId: categories.departmentId,
        slug: categories.slug,
        name: categories.name,
        archived: categories.archived,
      })
      .from(categories)
      .orderBy(asc(categories.position), asc(categories.name)),
    db
      .select({ id: brands.id, slug: brands.slug, name: brands.name, archived: brands.archived })
      .from(brands)
      .orderBy(asc(brands.name)),
    liveCounts(db, products.departmentId),
    liveCounts(db, products.categoryId),
    liveCounts(db, products.brandId),
  ]);
  return {
    departments: deps.map((d) => ({ ...d, products: byDepartment.get(d.id) ?? 0 })),
    categories: cats.map((c) => ({ ...c, products: byCategory.get(c.id) ?? 0 })),
    brands: brandRows.map((b) => ({ ...b, products: byBrand.get(b.id) ?? 0 })),
  };
}

export async function findTaxon(db: Reader, kind: TaxonKind, id: number) {
  const table = TABLES[kind];
  const [row] = await db
    .select({ id: table.id, archived: table.archived })
    .from(table)
    .where(eq(table.id, id));
  return row;
}

/** The parent department of a category (for restore and create checks). */
export async function categoryDepartment(db: Reader, categoryId: number) {
  const [row] = await db
    .select({ id: departments.id, archived: departments.archived })
    .from(categories)
    .innerJoin(departments, eq(departments.id, categories.departmentId))
    .where(eq(categories.id, categoryId));
  return row;
}

export async function liveProductCount(db: Reader, kind: TaxonKind, id: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(products)
    .where(and(eq(COLUMN[kind], id), eq(products.archived, false)));
  return row?.n ?? 0;
}

/** Archives (only while no live product uses it) or restores. Returns false when blocked. */
export async function setTaxonArchived(
  tx: Tx,
  kind: TaxonKind,
  id: number,
  archived: boolean,
): Promise<boolean> {
  const table = TABLES[kind];
  const column = COLUMN[kind];
  const guard = archived
    ? sql`not exists (select 1 from ${products} where ${column} = ${id} and ${products.archived} = 0)`
    : undefined;
  const rows = await tx
    .update(table)
    .set({ archived })
    .where(and(eq(table.id, id), guard))
    .returning({ id: table.id });
  return rows.length > 0;
}

export async function slugInUse(
  db: Reader,
  kind: TaxonKind,
  slug: string,
  departmentId: number | undefined,
): Promise<boolean> {
  if (kind === 'category') {
    const [row] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.slug, slug), eq(categories.departmentId, departmentId ?? 0)));
    return row !== undefined;
  }
  const table = TABLES[kind];
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.slug, slug));
  return row !== undefined;
}

export async function insertTaxon(
  tx: Tx,
  kind: TaxonKind,
  fields: { readonly name: string; readonly slug: string; readonly departmentId?: number },
): Promise<number> {
  const position = kind === 'brand' ? undefined : await nextPosition(tx, kind, fields.departmentId);
  const [row] =
    kind === 'department'
      ? await tx
          .insert(departments)
          .values({ name: fields.name, slug: fields.slug, position: position ?? 0 })
          .returning({ id: departments.id })
      : kind === 'category'
        ? await tx
            .insert(categories)
            .values({
              name: fields.name,
              slug: fields.slug,
              departmentId: fields.departmentId ?? 0,
              position: position ?? 0,
            })
            .returning({ id: categories.id })
        : await tx
            .insert(brands)
            .values({ name: fields.name, slug: fields.slug })
            .returning({ id: brands.id });
  if (row === undefined) throw new Error(`${kind} insert returned nothing`);
  return row.id;
}

/** New departments and categories go last in their list. */
async function nextPosition(
  tx: Tx,
  kind: 'department' | 'category',
  departmentId: number | undefined,
): Promise<number> {
  const [row] =
    kind === 'department'
      ? await tx
          .select({ max: sql<number>`coalesce(max(${departments.position}), 0)` })
          .from(departments)
      : await tx
          .select({ max: sql<number>`coalesce(max(${categories.position}), 0)` })
          .from(categories)
          .where(eq(categories.departmentId, departmentId ?? 0));
  return (row?.max ?? 0) + 1;
}

/** A product's department, category and brand archive flags (restoring a product). */
export async function productTaxa(db: Reader, productId: number) {
  const [row] = await db
    .select({
      department: departments.archived,
      category: categories.archived,
      brand: brands.archived,
    })
    .from(products)
    .innerJoin(departments, eq(departments.id, products.departmentId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(eq(products.id, productId));
  return row;
}

// Catalog fixtures for route tests: grow a category past one page without reseeding.
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../src/db/client.js';
import { categories, departments, products } from '../../src/db/schema.js';

/** The first category of a department in the seeded test catalog. */
export async function firstCategory(db: Db, departmentSlug: string) {
  const [row] = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      departmentId: departments.id,
    })
    .from(categories)
    .innerJoin(departments, eq(departments.id, categories.departmentId))
    .where(eq(departments.slug, departmentSlug))
    .orderBy(categories.position);
  if (row === undefined) throw new Error(`no categories in ${departmentSlug}`);
  return row;
}

/** Adds `count` copies of an existing product to a category, with unique slugs. */
export async function addProducts(db: Db, categoryId: number, count: number): Promise<void> {
  const [template] = await db.select().from(products).where(eq(products.categoryId, categoryId));
  if (template === undefined) throw new Error(`category ${String(categoryId)} has no products`);
  const copy: typeof products.$inferInsert = { ...template };
  delete copy.id; // new rows get new ids
  const rows = Array.from({ length: count }, (_, i) => ({
    ...copy,
    slug: `${template.slug}-extra-${String(i + 1)}`,
    name: `${template.name} ${String(i + 1)}`,
  }));
  for (let i = 0; i < rows.length; i += 50) await db.insert(products).values(rows.slice(i, i + 50));
}

/** Archives one product of a category (archived products are never listed). */
export async function archiveOne(db: Db, categoryId: number): Promise<void> {
  const [row] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.categoryId, categoryId));
  if (row === undefined) throw new Error('no product to archive');
  await db
    .update(products)
    .set({ archived: true })
    .where(and(eq(products.id, row.id)));
}

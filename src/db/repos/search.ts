// Full-text search over products (search spec). The `products_fts` table and its sync
// triggers come from migration 0002_search_fts. This module owns the FTS5 query syntax.
import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client.js';
import { categories, departments, products } from '../schema.js';

/**
 * bm25() column weights, in the table's column order: name, brand, category, department,
 * description. A match in the name outranks one in the brand, and so on (search spec).
 */
export const SEARCH_WEIGHTS = [10, 5, 3, 2, 1] as const;

/**
 * An FTS5 MATCH expression for search terms (from domain/search.ts searchTerms): every term
 * must match, each as a quoted prefix. Terms are letters and digits only, and quoting makes
 * words like OR or NEAR plain text. `undefined` when there is nothing to search for.
 */
export function ftsMatch(terms: readonly string[]): string | undefined {
  const safe = terms.filter((t) => /^[\p{L}\p{N}]+$/u.test(t));
  return safe.length === 0 ? undefined : safe.map((t) => `"${t}"*`).join(' ');
}

/** Products matching an expression (parameterized: the expression is a bound value). */
export const matchesSearch = (match: string): SQL =>
  sql`${products.id} in (select rowid from products_fts where products_fts match ${match})`;

/** A product's relevance for an expression: bm25, where lower is better. */
export const searchRank = (match: string): SQL<number> =>
  sql<number>`(select bm25(products_fts, ${sql.raw(SEARCH_WEIGHTS.join(', '))})
    from products_fts where products_fts.rowid = ${products.id} and products_fts match ${match})`;

/**
 * Departments whose name contains every term (header suggestions: "kitch" → Home & Kitchen,
 * which no category name contains). Same term rules as suggestCategories.
 */
export function suggestDepartments(
  db: Db,
  terms: readonly string[],
  limit: number,
): Promise<{ name: string; slug: string }[]> {
  return db
    .select({ name: departments.name, slug: departments.slug })
    .from(departments)
    .where(
      and(
        eq(departments.archived, false),
        ...terms.map((t) => sql`lower(${departments.name}) like ${`%${t.toLowerCase()}%`}`),
      ),
    )
    .orderBy(departments.position)
    .limit(limit);
}

/**
 * Categories whose name contains every term (header suggestions). Terms are letters and digits
 * only (domain searchTerms), so they carry no LIKE wildcards; values are bound parameters.
 */
export function suggestCategories(
  db: Db,
  terms: readonly string[],
  limit: number,
): Promise<{ name: string; slug: string; department: string; departmentName: string }[]> {
  return db
    .select({
      name: categories.name,
      slug: categories.slug,
      department: departments.slug,
      departmentName: departments.name,
    })
    .from(categories)
    .innerJoin(departments, eq(departments.id, categories.departmentId))
    .where(
      and(
        eq(departments.archived, false),
        eq(categories.archived, false),
        ...terms.map((t) => sql`lower(${categories.name}) like ${`%${t.toLowerCase()}%`}`),
      ),
    )
    .orderBy(departments.position, categories.position)
    .limit(limit);
}

// Sitemap reads: every indexable catalog URL with its last-modified time (seo.md).
import { and, eq, max } from 'drizzle-orm';
import type { Db } from '../client.js';
import { categories, departments, products } from '../schema.js';

export interface SitemapRows {
  readonly departments: readonly { readonly slug: string; readonly lastmod: Date | null }[];
  readonly categories: readonly {
    readonly department: string;
    readonly slug: string;
    readonly lastmod: Date | null;
  }[];
  readonly products: readonly { readonly slug: string; readonly lastmod: Date }[];
}

const live = eq(products.archived, false);

/** Departments and categories take the newest product's time; archived products are left out. */
export async function sitemapRows(db: Db): Promise<SitemapRows> {
  const [departmentRows, categoryRows, productRows] = await Promise.all([
    db
      .select({ slug: departments.slug, lastmod: max(products.createdAt) })
      .from(departments)
      .leftJoin(products, and(eq(products.departmentId, departments.id), live))
      .groupBy(departments.id)
      .orderBy(departments.position),
    db
      .select({
        department: departments.slug,
        slug: categories.slug,
        lastmod: max(products.createdAt),
      })
      .from(categories)
      .innerJoin(departments, eq(departments.id, categories.departmentId))
      .leftJoin(products, and(eq(products.categoryId, categories.id), live))
      .groupBy(categories.id)
      .orderBy(departments.position, categories.position),
    db
      .select({ slug: products.slug, lastmod: products.createdAt })
      .from(products)
      .where(live)
      .orderBy(products.id),
  ]);
  return { departments: departmentRows, categories: categoryRows, products: productRows };
}

// Admin review moderation queries (docs/product-specs/admin.md, "Reviews"). Hiding and showing
// go through setReviewHidden (repos/reviews.ts), which recomputes the product's rating.
import { and, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client.js';
import { products, reviews, users } from '../schema.js';
import type { Tx } from '../tx.js';
import type { ReviewFilter } from '../../domain/admin-manage.js';

type Reader = Db | Tx;

const likeText = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function where(q: string, filter: ReviewFilter): SQL | undefined {
  return and(
    filter === 'all' ? undefined : eq(reviews.hidden, filter === 'hidden'),
    q === ''
      ? undefined
      : sql`(lower(${products.name}) like ${likeText(q.toLowerCase())} escape '\\' or lower(${reviews.title}) like ${likeText(q.toLowerCase())} escape '\\')`,
  );
}

export async function countAdminReviews(db: Reader, q: string, filter: ReviewFilter) {
  const [row] = await db
    .select({ n: count() })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(where(q, filter));
  return row?.n ?? 0;
}

export function adminReviewRows(
  db: Reader,
  q: string,
  filter: ReviewFilter,
  page: { limit: number; offset: number },
) {
  return db
    .select({
      id: reviews.id,
      productId: products.id,
      product: products.name,
      slug: products.slug,
      author: users.name,
      rating: reviews.rating,
      title: reviews.title,
      body: reviews.body,
      hidden: reviews.hidden,
      helpful: reviews.helpfulCount,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .innerJoin(users, eq(users.id, reviews.userId))
    .where(where(q, filter))
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .limit(page.limit)
    .offset(page.offset);
}

/** The product's stored rating after moderation. */
export async function productRating(db: Reader, reviewId: number) {
  const [row] = await db
    .select({ sum: products.ratingSum, count: products.ratingCount })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(eq(reviews.id, reviewId));
  return row;
}

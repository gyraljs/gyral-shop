// Ratings and reviews (docs/product-specs/wishlist-reviews.md). Every write runs in a locked
// transaction (src/db/tx.ts) and recomputes the product's rating aggregates from its visible
// reviews, so product cards, the product page and structured data always agree.
import { and, count, desc, eq, inArray, sql, sum } from 'drizzle-orm';
import {
  aggregate,
  PURCHASE_STATUSES,
  REVIEWS_PER_PAGE,
  type ReviewSort,
} from '../../domain/reviews.js';
import type { VoteRefusal } from '../../domain/reviews.js';
import { err, ok, type Result } from '../../domain/result.js';
import type { Db } from '../client.js';
import { orderLines, orders, products, reviews, reviewVotes, users, variants } from '../schema.js';
import { writeTransaction, type Writer } from '../tx.js';

export interface ListedReview {
  readonly id: number;
  readonly rating: number;
  readonly title: string;
  readonly body: string;
  readonly author: string;
  readonly createdAt: Date;
  readonly helpfulCount: number;
  readonly own: boolean;
  readonly voted: boolean;
}

/** True when the member has a paid (or later) order containing any variant of the product. */
export async function hasPurchased(db: Db, userId: number, productId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: orders.id })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .innerJoin(variants, eq(variants.id, orderLines.variantId))
    .where(
      and(
        eq(orders.userId, userId),
        eq(variants.productId, productId),
        inArray(orders.status, [...PURCHASE_STATUSES]),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** The member's own review of the product (hidden ones included: still one per member). */
export async function ownReviewId(
  db: Db,
  userId: number,
  productId: number,
): Promise<number | undefined> {
  const [row] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.userId, userId), eq(reviews.productId, productId)))
    .limit(1);
  return row?.id;
}

/** One page of visible reviews, with whether the viewer wrote or voted for each. */
export async function listReviews(
  db: Db,
  productId: number,
  options: { readonly sort: ReviewSort; readonly page: number; readonly viewerId?: number },
): Promise<{ readonly rows: readonly ListedReview[]; readonly total: number }> {
  const visible = and(eq(reviews.productId, productId), eq(reviews.hidden, false));
  const order =
    options.sort === 'newest'
      ? [desc(reviews.createdAt), desc(reviews.id)]
      : [desc(reviews.helpfulCount), desc(reviews.createdAt), desc(reviews.id)];
  const viewer = options.viewerId ?? -1;
  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        title: reviews.title,
        body: reviews.body,
        author: users.name,
        createdAt: reviews.createdAt,
        helpfulCount: reviews.helpfulCount,
        own: sql<number>`${reviews.userId} = ${viewer}`,
        voted: sql<number>`exists (select 1 from ${reviewVotes} where ${reviewVotes.reviewId} = ${reviews.id} and ${reviewVotes.userId} = ${viewer})`,
      })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.userId))
      .where(visible)
      .orderBy(...order)
      .limit(REVIEWS_PER_PAGE)
      .offset((options.page - 1) * REVIEWS_PER_PAGE),
    db.select({ n: count() }).from(reviews).where(visible),
  ]);
  return {
    rows: rows.map((r) => ({ ...r, own: Boolean(r.own), voted: Boolean(r.voted) })),
    total: totals?.n ?? 0,
  };
}

/** Recomputes a product's rating sum and count from its visible reviews. */
export async function recomputeRating(w: Writer, productId: number): Promise<void> {
  const [row] = await w
    .select({ total: sum(reviews.rating), n: count() })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.hidden, false)));
  const { ratingSum, ratingCount } = {
    ratingSum: Number(row?.total ?? 0),
    ratingCount: row?.n ?? 0,
  };
  await w.update(products).set({ ratingSum, ratingCount }).where(eq(products.id, productId));
}

export interface NewReview {
  readonly productId: number;
  readonly userId: number;
  readonly rating: number;
  readonly title: string;
  readonly body: string;
}

/** Inserts the member's review; `Duplicate` when they already reviewed the product. */
export function createReview(
  db: Db,
  review: NewReview,
): Promise<Result<{ readonly id: number }, 'Duplicate'>> {
  return writeTransaction(db, async (tx) => {
    const [row] = await tx
      .insert(reviews)
      .values(review)
      .onConflictDoNothing({ target: [reviews.productId, reviews.userId] })
      .returning({ id: reviews.id });
    if (row === undefined) return err('Duplicate' as const);
    await recomputeRating(tx, review.productId);
    return ok({ id: row.id });
  });
}

/** Hides or shows a review (admin moderation) and recomputes the product's rating. */
export function setReviewHidden(db: Db, reviewId: number, hidden: boolean): Promise<boolean> {
  return writeTransaction(db, async (tx) => {
    const [row] = await tx
      .update(reviews)
      .set({ hidden })
      .where(eq(reviews.id, reviewId))
      .returning({ productId: reviews.productId });
    if (row === undefined) return false;
    await recomputeRating(tx, row.productId);
    return true;
  });
}

/** Counts one "helpful" vote per member; never on their own or a hidden review. */
export function voteHelpful(
  db: Db,
  reviewId: number,
  userId: number,
): Promise<Result<{ readonly helpfulCount: number }, VoteRefusal>> {
  return writeTransaction(db, async (tx) => {
    const [review] = await tx
      .select({ userId: reviews.userId })
      .from(reviews)
      .where(and(eq(reviews.id, reviewId), eq(reviews.hidden, false)));
    if (review === undefined) return err('NotFound' as const);
    if (review.userId === userId) return err('OwnReview' as const);
    const [vote] = await tx
      .insert(reviewVotes)
      .values({ reviewId, userId })
      .onConflictDoNothing()
      .returning({ reviewId: reviewVotes.reviewId });
    if (vote === undefined) return err('AlreadyVoted' as const);
    const [updated] = await tx
      .update(reviews)
      .set({ helpfulCount: sql`${reviews.helpfulCount} + 1` })
      .where(eq(reviews.id, reviewId))
      .returning({ helpfulCount: reviews.helpfulCount });
    return ok({ helpfulCount: updated?.helpfulCount ?? 0 });
  });
}

/** The product a review belongs to (for redirects after a vote). */
export async function reviewProductSlug(db: Db, reviewId: number): Promise<string | undefined> {
  const [row] = await db
    .select({ slug: products.slug })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(eq(reviews.id, reviewId));
  return row?.slug;
}

/** Visible ratings of a product, for checks that the stored aggregate is consistent. */
export async function visibleRatingAggregate(db: Db, productId: number) {
  const rows = await db
    .select({ rating: reviews.rating })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.hidden, false)));
  return aggregate(rows.map((r) => r.rating));
}

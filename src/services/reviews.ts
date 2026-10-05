// Reviews use-cases (docs/product-specs/wishlist-reviews.md): the reviews section's view model,
// writing a review (verified purchasers, one each) and helpful votes. Plain data (ISO dates),
// so it renders on the server and seeds the hydrating <shop-reviews> island.
import {
  averageRating,
  eligibility,
  reviewPages,
  type ReviewEligibility,
  type ReviewSort,
  type VoteRefusal,
} from '../domain/reviews.js';
import { err, ok, type Result } from '../domain/result.js';
import type { Db } from '../db/client.js';
import { findProduct, ratingDistribution } from '../db/repos/product.js';
import {
  createReview,
  hasPurchased,
  listReviews,
  ownReviewId,
  voteHelpful,
} from '../db/repos/reviews.js';
import { reviewerName, type RatingSummary } from './product.js';

export interface ReviewItem {
  readonly id: number;
  readonly rating: number;
  readonly title: string;
  readonly body: string;
  /** First name and last initial only. */
  readonly author: string;
  /** ISO date (YYYY-MM-DD). */
  readonly date: string;
  readonly helpfulCount: number;
  /** Written by the viewer (no vote button). */
  readonly own: boolean;
  /** The viewer already found it helpful. */
  readonly voted: boolean;
}

export interface ReviewsView {
  readonly slug: string;
  readonly productName: string;
  readonly summary: RatingSummary;
  readonly items: readonly ReviewItem[];
  readonly sort: ReviewSort;
  readonly page: number;
  readonly pages: number;
  /** Visible reviews in total (the list may be one page of them). */
  readonly total: number;
  readonly eligibility: ReviewEligibility;
}

export interface ReviewQuery {
  readonly sort: ReviewSort;
  readonly page: number;
  /** The signed-in member viewing the page, if any. */
  readonly viewerId?: number;
}

/** The reviews section for a product, or undefined for an unknown or archived slug. */
export async function reviewsView(
  db: Db,
  slug: string,
  query: ReviewQuery,
): Promise<ReviewsView | undefined> {
  const detail = await findProduct(db, slug);
  if (detail === undefined) return undefined;
  const { product } = detail;
  const viewer = query.viewerId;
  const [distribution, list, purchased, ownId] = await Promise.all([
    ratingDistribution(db, product.id),
    listReviews(db, product.id, query),
    viewer === undefined ? false : hasPurchased(db, viewer, product.id),
    viewer === undefined ? undefined : ownReviewId(db, viewer, product.id),
  ]);
  return {
    slug: product.slug,
    productName: product.name,
    summary: {
      average: averageRating(product),
      count: product.ratingCount,
      distribution: [5, 4, 3, 2, 1].map((stars) => ({
        stars,
        count: distribution.get(stars) ?? 0,
      })),
    },
    items: list.rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      author: reviewerName(r.author),
      date: r.createdAt.toISOString().slice(0, 10),
      helpfulCount: r.helpfulCount,
      own: r.own,
      voted: r.voted,
    })),
    sort: query.sort,
    page: query.page,
    pages: reviewPages(list.total),
    total: list.total,
    eligibility: eligibility({
      signedIn: viewer !== undefined,
      purchased,
      ownReviewId: ownId,
    }),
  };
}

export interface ReviewInput {
  readonly rating: number;
  readonly title: string;
  readonly body: string;
}

export type SubmitRefusal = 'UnknownProduct' | 'NotPurchased' | 'Duplicate';

export const submitRefusalMessage = (r: SubmitRefusal): string => {
  switch (r) {
    case 'UnknownProduct':
      return 'That product is no longer available.';
    case 'NotPurchased':
      return 'Only customers who bought this item can review it.';
    case 'Duplicate':
      return 'You have already reviewed this item.';
  }
};

/** Writes the member's review of the product (verified purchasers only, one each). */
export async function submitReview(
  db: Db,
  slug: string,
  userId: number,
  input: ReviewInput,
): Promise<Result<{ readonly id: number }, SubmitRefusal>> {
  const detail = await findProduct(db, slug);
  if (detail === undefined) return err('UnknownProduct');
  const productId = detail.product.id;
  if (!(await hasPurchased(db, userId, productId))) return err('NotPurchased');
  const created = await createReview(db, { productId, userId, ...input });
  return created.ok ? ok(created.value) : err('Duplicate');
}

/** Counts the member's helpful vote. */
export function markHelpful(
  db: Db,
  reviewId: number,
  userId: number,
): Promise<Result<{ readonly helpfulCount: number }, VoteRefusal>> {
  return voteHelpful(db, reviewId, userId);
}

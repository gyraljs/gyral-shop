// Ratings and reviews (docs/product-specs/wishlist-reviews.md): who may write one, how lists
// are sorted and paged, and the product's rating aggregates. Pure; the db and services layers
// apply these rules.
import type { OrderStatus } from './orders.js';

export const REVIEW_TITLE_MIN = 3;
export const REVIEW_TITLE_MAX = 100;
export const REVIEW_BODY_MIN = 10;
export const REVIEW_BODY_MAX = 2000;
/** Reviews per page on the reviews page and in the product page's section. */
export const REVIEWS_PER_PAGE = 5;

export const REVIEW_SORTS = ['helpful', 'newest'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];
export const DEFAULT_REVIEW_SORT: ReviewSort = 'helpful';

export const isReviewSort = (value: string | undefined): value is ReviewSort =>
  value !== undefined && (REVIEW_SORTS as readonly string[]).includes(value);

/**
 * Orders that count as a purchase: paid or later, including partial refunds. Pending,
 * cancelled and fully refunded orders don't.
 */
export const PURCHASE_STATUSES = [
  'paid',
  'fulfilled',
  'delivered',
  'partially_refunded',
] as const satisfies readonly OrderStatus[];

export const countsAsPurchase = (status: OrderStatus): boolean =>
  (PURCHASE_STATUSES as readonly OrderStatus[]).includes(status);

/** What the product page offers the viewer next to the reviews. */
export type ReviewEligibility =
  | { readonly _tag: 'SignIn' }
  | { readonly _tag: 'NotPurchased' }
  | { readonly _tag: 'AlreadyReviewed'; readonly reviewId: number }
  | { readonly _tag: 'CanReview' };

export function eligibility(viewer: {
  readonly signedIn: boolean;
  readonly purchased: boolean;
  readonly ownReviewId: number | undefined;
}): ReviewEligibility {
  if (!viewer.signedIn) return { _tag: 'SignIn' };
  if (viewer.ownReviewId !== undefined) {
    return { _tag: 'AlreadyReviewed', reviewId: viewer.ownReviewId };
  }
  return viewer.purchased ? { _tag: 'CanReview' } : { _tag: 'NotPurchased' };
}

export const eligibilityMessage = (e: ReviewEligibility): string => {
  switch (e._tag) {
    case 'SignIn':
      return 'Sign in to write a review.';
    case 'NotPurchased':
      return 'Only customers who bought this item can review it.';
    case 'AlreadyReviewed':
      return 'You have already reviewed this item.';
    case 'CanReview':
      return 'Share what you think of this item.';
  }
};

/** Page count for `total` reviews (at least 1, so an empty list still has page 1). */
export const reviewPages = (total: number): number =>
  Math.max(1, Math.ceil(total / REVIEWS_PER_PAGE));

/** Parses `?page=`: a positive integer, else undefined (callers redirect or 404). */
export function parseReviewPage(raw: string | undefined): number | undefined {
  if (raw === undefined) return 1;
  if (!/^[1-9]\d{0,5}$/.test(raw)) return undefined;
  return Number(raw);
}

/** Rating aggregates as stored on products: the sum and count of visible review ratings. */
export interface RatingAggregate {
  readonly ratingSum: number;
  readonly ratingCount: number;
}

export const aggregate = (ratings: readonly number[]): RatingAggregate => ({
  ratingSum: ratings.reduce((sum, r) => sum + r, 0),
  ratingCount: ratings.length,
});

/** Average to one decimal, or null when there are no ratings. */
export const averageRating = ({ ratingSum, ratingCount }: RatingAggregate): number | null =>
  ratingCount === 0 ? null : Math.round((ratingSum / ratingCount) * 10) / 10;

/** Why a helpful vote was not counted. */
export type VoteRefusal = 'OwnReview' | 'AlreadyVoted' | 'NotFound';

export const voteRefusalMessage = (r: VoteRefusal): string => {
  switch (r) {
    case 'OwnReview':
      return "You can't vote on your own review.";
    case 'AlreadyVoted':
      return 'You already found this review helpful.';
    case 'NotFound':
      return 'That review is no longer available.';
  }
};

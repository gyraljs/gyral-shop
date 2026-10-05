// The reviews section's data in the browser (docs/product-specs/wishlist-reviews.md). The same
// shape as services/reviews.ts ReviewsView, parsed with valibot wherever it arrives as JSON
// (core belief 4: parse at every boundary).
import * as v from 'valibot';
import { REVIEW_SORTS, type ReviewSort } from '../../domain/reviews.js';

const Eligibility = v.variant('_tag', [
  v.object({ _tag: v.literal('SignIn') }),
  v.object({ _tag: v.literal('NotPurchased') }),
  v.object({ _tag: v.literal('AlreadyReviewed'), reviewId: v.number() }),
  v.object({ _tag: v.literal('CanReview') }),
]);

const Item = v.object({
  id: v.number(),
  rating: v.number(),
  title: v.string(),
  body: v.string(),
  author: v.string(),
  date: v.string(),
  helpfulCount: v.number(),
  own: v.boolean(),
  voted: v.boolean(),
});

export const ReviewsViewSchema = v.object({
  slug: v.string(),
  productName: v.string(),
  summary: v.object({
    average: v.nullable(v.number()),
    count: v.number(),
    distribution: v.array(v.object({ stars: v.number(), count: v.number() })),
  }),
  items: v.array(Item),
  sort: v.picklist(REVIEW_SORTS),
  page: v.number(),
  pages: v.number(),
  total: v.number(),
  eligibility: Eligibility,
});

type DeepReadonly<T> = T extends readonly (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** Readonly, so the server's view model (services/reviews.ts ReviewsView) is assignable. */
export type ReviewsViewData = DeepReadonly<v.InferOutput<typeof ReviewsViewSchema>>;
export type ReviewItemData = ReviewsViewData['items'][number];

/** The helpful-vote endpoint's answers. */
export const VotedSchema = v.object({ helpfulCount: v.number() });
export const VoteErrorSchema = v.object({ message: v.string() });

export const reviewsPath = (slug: string): string => `/p/${slug}/reviews`;
export const writeReviewPath = (slug: string): string => `/p/${slug}/review`;
export const reviewsApiPath = (slug: string): string => `/api/reviews/${slug}`;
export const helpfulPath = (reviewId: number): string => `/reviews/${String(reviewId)}/helpful`;

/** A reviews URL; default sort and first page stay off the query string (one spelling). */
export function reviewsHref(base: string, sort: ReviewSort, page: number): string {
  const query = new URLSearchParams();
  if (sort !== 'helpful') query.set('sort', sort);
  if (page !== 1) query.set('page', String(page));
  const qs = query.toString();
  return qs === '' ? base : `${base}?${qs}`;
}

const plural = (n: number, word: string) => `${String(n)} ${word}${n === 1 ? '' : 's'}`;
export { plural };

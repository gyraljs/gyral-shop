import { describe, expect, it } from 'vitest';
import {
  aggregate,
  averageRating,
  countsAsPurchase,
  eligibility,
  isReviewSort,
  parseReviewPage,
  reviewPages,
} from './reviews.js';

describe('review rules', () => {
  it('decides who may review, in order: sign in, already reviewed, purchased', () => {
    expect(eligibility({ signedIn: false, purchased: true, ownReviewId: undefined })._tag).toBe(
      'SignIn',
    );
    expect(eligibility({ signedIn: true, purchased: true, ownReviewId: 7 })).toEqual({
      _tag: 'AlreadyReviewed',
      reviewId: 7,
    });
    expect(eligibility({ signedIn: true, purchased: false, ownReviewId: undefined })._tag).toBe(
      'NotPurchased',
    );
    expect(eligibility({ signedIn: true, purchased: true, ownReviewId: undefined })._tag).toBe(
      'CanReview',
    );
  });

  it('counts paid and later orders as purchases, not pending, cancelled or refunded', () => {
    expect(countsAsPurchase('paid')).toBe(true);
    expect(countsAsPurchase('delivered')).toBe(true);
    expect(countsAsPurchase('partially_refunded')).toBe(true);
    expect(countsAsPurchase('pending_payment')).toBe(false);
    expect(countsAsPurchase('cancelled')).toBe(false);
    expect(countsAsPurchase('refunded')).toBe(false);
  });

  it('parses pages and sorts strictly', () => {
    expect(parseReviewPage(undefined)).toBe(1);
    expect(parseReviewPage('3')).toBe(3);
    for (const bad of ['0', '-1', '1.5', 'abc', '01', ''])
      expect(parseReviewPage(bad)).toBeUndefined();
    expect(isReviewSort('newest')).toBe(true);
    expect(isReviewSort('oldest')).toBe(false);
    expect(reviewPages(0)).toBe(1);
    expect(reviewPages(5)).toBe(1);
    expect(reviewPages(6)).toBe(2);
  });

  it('aggregates ratings and averages to one decimal', () => {
    const a = aggregate([5, 4, 4]);
    expect(a).toEqual({ ratingSum: 13, ratingCount: 3 });
    expect(averageRating(a)).toBe(4.3);
    expect(averageRating(aggregate([]))).toBeNull();
  });
});

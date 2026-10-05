// Ranking by rating without letting one 5-star review beat hundreds of 4.6s
// (docs/product-specs/content.md, "Top rated"): a Bayesian average pulls products with few
// reviews toward a prior, and top-rated lists also require a minimum number of reviews.

/** The prior: as if every product already had PRIOR_COUNT reviews averaging PRIOR_MEAN. */
export const PRIOR_MEAN = 3.5;
export const PRIOR_COUNT = 5;
/** Top-rated lists skip products with fewer reviews than this. */
export const MIN_REVIEWS_FOR_TOP_RATED = 3;

export const bayesianRating = (ratingSum: number, ratingCount: number): number =>
  (ratingSum + PRIOR_MEAN * PRIOR_COUNT) / (ratingCount + PRIOR_COUNT);

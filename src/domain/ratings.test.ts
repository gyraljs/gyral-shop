import { describe, expect, it } from 'vitest';
import { bayesianRating, PRIOR_MEAN } from './ratings.js';

describe('bayesianRating', () => {
  it('ranks many good reviews above a single perfect one', () => {
    const single = bayesianRating(5, 1);
    const many = bayesianRating(4.6 * 200, 200);
    expect(many).toBeGreaterThan(single);
  });

  it('is the prior for an unrated product and approaches the mean with volume', () => {
    expect(bayesianRating(0, 0)).toBe(PRIOR_MEAN);
    expect(bayesianRating(4 * 10_000, 10_000)).toBeCloseTo(4, 2);
  });

  it('never ranks a worse average above a better one at equal counts', () => {
    for (let count = 1; count < 50; count += 7) {
      expect(bayesianRating(4.5 * count, count)).toBeGreaterThan(bayesianRating(4 * count, count));
    }
  });
});

// Home page content (docs/product-specs/content.md): featured departments, deals, top rated
// (Bayesian, minimum reviews), best sellers and new arrivals.
import { describe, expect, it } from 'vitest';
import { bayesianRating, MIN_REVIEWS_FOR_TOP_RATED } from '../../src/domain/ratings.js';
import { homeData } from '../../src/services/catalog.js';
import { testApp } from '../support/app.js';

describe('home data', () => {
  it('ranks top rated by Bayesian average and skips products with few reviews', async () => {
    const { db } = await testApp();
    const { topRated } = await homeData(db);
    expect(topRated.length).toBeGreaterThan(0);
    for (const card of topRated)
      expect(card.ratingCount).toBeGreaterThanOrEqual(MIN_REVIEWS_FOR_TOP_RATED);
    const scores = topRated.map((c) =>
      bayesianRating((c.rating ?? 0) * c.ratingCount, c.ratingCount),
    );
    // Card ratings are rounded to one decimal, so allow that much slack in the order check.
    for (let n = 1; n < scores.length; n += 1) {
      expect(scores[n] ?? 0).toBeLessThanOrEqual((scores[n - 1] ?? 0) + 0.05);
    }
  });

  it('orders best sellers by review count and features every department with an image', async () => {
    const { db } = await testApp();
    const { bestSellers, featured, deals } = await homeData(db);
    const counts = bestSellers.map((c) => c.ratingCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(featured).toHaveLength(8);
    expect(featured.every((d) => d.image !== null && d.description !== '')).toBe(true);
    expect(deals.every((c) => c.salePriceCents !== null)).toBe(true);
  });
});

describe('home page', () => {
  it('server-renders every section with theme hooks', async () => {
    const test = await testApp();
    const html = await test.html('/');
    for (const region of [
      'hero',
      'departments',
      'deals',
      'top-rated',
      'best-sellers',
      'new-arrivals',
    ]) {
      expect(html).toContain(`data-region="${region}"`);
    }
    expect(html.match(/<li data-component="department-tile"/g)).toHaveLength(8);
    expect(html).toContain('<h2 id="best-sellers-title">');
  });
});

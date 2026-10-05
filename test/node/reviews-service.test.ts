// Reviews rules end to end against the database (docs/product-specs/wishlist-reviews.md):
// verified purchasers only, one review each, one helpful vote each, aggregates recomputed.
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { products } from '../../src/db/schema/catalog.js';
import { orders } from '../../src/db/schema/commerce.js';
import { users } from '../../src/db/schema/accounts.js';
import { setReviewHidden, visibleRatingAggregate } from '../../src/db/repos/reviews.js';
import { markHelpful, reviewsView, submitReview } from '../../src/services/reviews.js';
import { testApp, type TestApp } from '../support/app.js';
import { createMember, loginAs } from '../support/auth.js';
import { insertCartFixture, SKU, T0 } from '../support/cart-fixture.js';
import { placeOrder } from '../support/orders.js';

let test: TestApp;
let buyer: number;
let other: number;

const REVIEW = { rating: 4, title: 'Solid set', body: 'Kept the kids busy all weekend.' };

const userId = async (email: string) => {
  const [row] = await test.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (row === undefined) throw new Error(email);
  return row.id;
};

const legoAggregate = async () => {
  const [row] = await test.db
    .select({ sum: products.ratingSum, count: products.ratingCount, id: products.id })
    .from(products)
    .where(eq(products.slug, 'lego'));
  if (row === undefined) throw new Error('lego');
  return row;
};

beforeEach(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  await insertCartFixture(test.db);
  for (const [name, email] of [
    ['Grace Hopper', 'grace@example.com'],
    ['Alan Turing', 'alan@example.com'],
  ] as const) {
    await createMember(test, { name, email, password: 'correct-horse-battery-9' });
  }
  await placeOrder(await loginAs(test, 'grace@example.com'), { sku: SKU.lego });
  await placeOrder(await loginAs(test, 'alan@example.com'), { sku: SKU.lego });
  buyer = await userId('grace@example.com');
  other = await userId('alan@example.com');
});

describe('reviews service', () => {
  it('lets a verified purchaser review once and recomputes the rating aggregate', async () => {
    const first = await submitReview(test.db, 'lego', buyer, REVIEW);
    expect(first.ok).toBe(true);
    expect(await submitReview(test.db, 'lego', buyer, { ...REVIEW, rating: 1 })).toEqual({
      ok: false,
      error: 'Duplicate',
    });
    await submitReview(test.db, 'lego', other, { ...REVIEW, rating: 5 });
    const agg = await legoAggregate();
    expect([agg.sum, agg.count]).toEqual([9, 2]);
    expect(await visibleRatingAggregate(test.db, agg.id)).toEqual({ ratingSum: 9, ratingCount: 2 });
  });

  it('refuses members who never bought the product, or whose order was not paid', async () => {
    expect((await submitReview(test.db, 'tv', buyer, REVIEW)).ok).toBe(false);
    await test.db.update(orders).set({ status: 'cancelled' }).where(eq(orders.userId, buyer));
    expect(await submitReview(test.db, 'lego', buyer, REVIEW)).toEqual({
      ok: false,
      error: 'NotPurchased',
    });
    expect(await submitReview(test.db, 'no-such', buyer, REVIEW)).toEqual({
      ok: false,
      error: 'UnknownProduct',
    });
  });

  it('reports eligibility for guests, buyers, non-buyers and reviewers', async () => {
    const view = (viewerId?: number) =>
      reviewsView(test.db, 'lego', {
        sort: 'helpful',
        page: 1,
        ...(viewerId === undefined ? {} : { viewerId }),
      });
    expect((await view())?.eligibility._tag).toBe('SignIn');
    expect((await view(buyer))?.eligibility._tag).toBe('CanReview');
    const ann = await userId('ann@example.com');
    expect((await view(ann))?.eligibility._tag).toBe('NotPurchased');
    const created = await submitReview(test.db, 'lego', buyer, REVIEW);
    if (!created.ok) throw new Error('review');
    expect((await view(buyer))?.eligibility).toEqual({
      _tag: 'AlreadyReviewed',
      reviewId: created.value.id,
    });
  });

  it('counts one helpful vote per member, never on their own review', async () => {
    const created = await submitReview(test.db, 'lego', buyer, REVIEW);
    if (!created.ok) throw new Error('review');
    const id = created.value.id;
    expect(await markHelpful(test.db, id, buyer)).toEqual({ ok: false, error: 'OwnReview' });
    expect(await markHelpful(test.db, id, other)).toEqual({ ok: true, value: { helpfulCount: 1 } });
    expect(await markHelpful(test.db, id, other)).toEqual({ ok: false, error: 'AlreadyVoted' });
    const listed = await reviewsView(test.db, 'lego', {
      sort: 'helpful',
      page: 1,
      viewerId: other,
    });
    expect(listed?.items[0]).toMatchObject({ helpfulCount: 1, voted: true, own: false });
  });

  it('hides moderated reviews from lists and aggregates, but still counts them as written', async () => {
    const created = await submitReview(test.db, 'lego', buyer, REVIEW);
    if (!created.ok) throw new Error('review');
    expect(await setReviewHidden(test.db, created.value.id, true)).toBe(true);
    const agg = await legoAggregate();
    expect([agg.sum, agg.count]).toEqual([0, 0]);
    const view = await reviewsView(test.db, 'lego', { sort: 'newest', page: 1, viewerId: buyer });
    expect(view?.items).toEqual([]);
    expect(view?.eligibility._tag).toBe('AlreadyReviewed');
    expect(await markHelpful(test.db, created.value.id, other)).toEqual({
      ok: false,
      error: 'NotFound',
    });
  });

  it('sorts by helpfulness or date and pages five at a time', async () => {
    const ids: number[] = [];
    for (let n = 0; n < 7; n += 1) {
      const email = `buyer${String(n)}@example.com`;
      await createMember(test, {
        name: `Buyer ${String(n)}`,
        email,
        password: 'correct-horse-battery-9',
      });
      await placeOrder(await loginAs(test, email), { sku: SKU.lego, email });
      const r = await submitReview(test.db, 'lego', await userId(email), {
        ...REVIEW,
        title: `Review ${String(n)}`,
      });
      if (!r.ok) throw new Error('review');
      ids.push(r.value.id);
    }
    const last = ids.at(-1) ?? 0;
    await markHelpful(test.db, ids[0] ?? 0, other);
    const helpful = await reviewsView(test.db, 'lego', { sort: 'helpful', page: 1 });
    expect(helpful?.items[0]?.id).toBe(ids[0]);
    expect([helpful?.items.length, helpful?.pages, helpful?.total]).toEqual([5, 2, 7]);
    const page2 = await reviewsView(test.db, 'lego', { sort: 'helpful', page: 2 });
    expect(page2?.items).toHaveLength(2);
    const newest = await reviewsView(test.db, 'lego', { sort: 'newest', page: 1 });
    // Same timestamp from the fixed clock: ties fall back to id, newest first.
    expect(newest?.items[0]?.id).toBe(last);
  });
});

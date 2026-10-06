// Review routes (docs/product-specs/wishlist-reviews.md): pages, JSON, writing (no-JS and
// submitForm), helpful votes, and structured data that matches the visible reviews.
import { writeFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { reviews } from '../../src/db/schema/commerce.js';
import { users } from '../../src/db/schema/accounts.js';
import { submitReview } from '../../src/services/reviews.js';
import { ReviewsViewSchema } from '../../src/ui/product/reviews-model.js';
import * as v from 'valibot';
import { testApp, type TestApp } from '../support/app.js';
import { createMember, guest, loginAs, type TestSession } from '../support/auth.js';
import { insertCartFixture, SKU, T0 } from '../support/cart-fixture.js';
import { stableHtml } from '../support/fixtures.js';
import { placeOrder } from '../support/orders.js';

let test: TestApp;
let buyer: TestSession;
let other: TestSession;

const REVIEW = { rating: '5', title: 'Great bricks', body: 'Hours of building with the kids.' };

const idOf = async (email: string) => {
  const [row] = await test.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (row === undefined) throw new Error(email);
  return row.id;
};

/** Page text without comments (Gyral's anchors and markers). */
const visible = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

const jsonLd = (html: string): unknown[] =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1] ?? 'null') as unknown,
  );

const flashOf = (res: Response) =>
  decodeURIComponent(res.headers.getSetCookie().find((c) => c.startsWith('flash=')) ?? '');

beforeEach(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  await insertCartFixture(test.db);
  for (const [name, email] of [
    ['Grace Hopper', 'grace@example.com'],
    ['Alan Turing', 'alan@example.com'],
  ] as const) {
    await createMember(test, { name, email, password: 'correct-horse-battery-9' });
  }
  buyer = await loginAs(test, 'grace@example.com');
  other = await loginAs(test, 'alan@example.com');
  await placeOrder(buyer, { sku: SKU.lego });
  await placeOrder(other, { sku: SKU.lego, email: 'alan@example.com' });
});

describe('product page reviews section', () => {
  it('renders the reviews island and review snippets that match the visible reviews', async () => {
    await submitReview(test.db, 'lego', await idOf('alan@example.com'), {
      rating: 4,
      title: 'Solid',
      body: 'Sturdy and fun to build.',
    });
    const html = await (await buyer.get('/p/lego')).text();
    expect(html).toContain('<shop-reviews');
    expect(html).toContain('data-gyral-hydrate="visible"');
    expect(visible(html)).toContain('Solid');
    const product = jsonLd(html).find(
      (d): d is { review: { name: string; reviewRating: { ratingValue: string } }[] } =>
        typeof d === 'object' && d !== null && (d as { '@type'?: string })['@type'] === 'Product',
    );
    expect(product?.review.map((r) => [r.name, r.reviewRating.ratingValue])).toEqual([
      ['Solid', '4'],
    ]);
    writeFileSync(
      new URL('../fixtures/product-reviews.ssr.html', import.meta.url),
      stableHtml(html),
    );
  });

  it('offers buyers the write link and guests a sign-in link', async () => {
    expect(visible(await (await buyer.get('/p/lego')).text())).toContain('Write a review');
    const anon = visible(await test.html('/p/lego'));
    expect(anon).toContain('Sign in to write a review');
    expect(anon).toContain('/account/login?next=%2Fp%2Flego%2Freview');
  });
});

describe('reviews page and JSON', () => {
  beforeEach(async () => {
    for (let n = 0; n < 6; n += 1) {
      const email = `buyer${String(n)}@example.com`;
      await createMember(test, {
        name: `Buyer ${String(n)}`,
        email,
        password: 'correct-horse-battery-9',
      });
      await placeOrder(await loginAs(test, email), { sku: SKU.lego, email });
      await submitReview(test.db, 'lego', await idOf(email), {
        rating: 3 + (n % 3),
        title: `Review ${String(n)}`,
        body: 'Long enough to count as a review body.',
      });
    }
  });

  it('pages and sorts with one URL per state', async () => {
    const page1 = await test.get('/p/lego/reviews');
    expect(page1.status).toBe(200);
    const html = await page1.text();
    expect(html).toContain('<link rel="canonical" href="http://localhost/p/lego/reviews"');
    expect(html).not.toContain('name="robots"');
    expect(visible(html)).toContain('Page 1 of 2');
    for (const [from, to] of [
      ['/p/lego/reviews?sort=helpful', '/p/lego/reviews'],
      ['/p/lego/reviews?page=1', '/p/lego/reviews'],
      ['/p/lego/reviews?page=0', '/p/lego/reviews'],
      ['/p/lego/reviews?sort=oldest', '/p/lego/reviews'],
    ] as const) {
      const res = await test.get(from);
      expect([res.status, res.headers.get('location')], from).toEqual([301, to]);
    }
    expect((await test.get('/p/lego/reviews?page=3')).status).toBe(404);
    expect((await test.get('/p/nope/reviews')).status).toBe(404);
    const newest = await (await test.get('/p/lego/reviews?sort=newest')).text();
    expect(newest).toContain('<meta name="robots" content="noindex"');
    expect(newest).toContain('<link rel="canonical" href="http://localhost/p/lego/reviews"');
  });

  it('serves the same view model as JSON for in-place loading', async () => {
    const res = await test.get('/api/reviews/lego?sort=newest&page=2');
    expect(res.status).toBe(200);
    const view = v.parse(ReviewsViewSchema, await res.json());
    expect([view.sort, view.page, view.pages, view.items.length]).toEqual(['newest', 2, 2, 1]);
    expect((await test.get('/api/reviews/lego?sort=bad')).status).toBe(400);
    expect((await test.get('/api/reviews/lego?page=9')).status).toBe(404);
    writeFileSync(new URL('../fixtures/reviews-page2.json', import.meta.url), JSON.stringify(view));
  });
});

describe('writing a review', () => {
  it('sends guests to sign in and tells non-buyers why they cannot review', async () => {
    const anon = await (await guest(test)).get('/p/lego/review');
    expect(anon.status).toBe(303);
    expect(anon.headers.get('location')).toBe('/account/login?next=%2Fp%2Flego%2Freview');
    const tvPage = visible(await (await buyer.get('/p/tv/review')).text());
    expect(tvPage).toContain('Only customers who bought this item can review it.');
    expect(tvPage).not.toContain('<shop-review-form');
  });

  it('posts a review without JavaScript, then refuses a second one', async () => {
    const res = await buyer.postForm('/p/lego/review', REVIEW);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/^\/p\/lego\/reviews\?sort=newest#review-\d+$/);
    expect(flashOf(res)).toContain('Thanks, your review is posted.');
    const again = await buyer.postForm('/p/lego/review', REVIEW);
    expect(again.status).toBe(422);
    expect(visible(await again.text())).toContain('You have already reviewed this item.');
  });

  it('re-renders field errors with 422 and keeps typed values', async () => {
    const res = await buyer.postForm('/p/lego/review', { rating: '', title: 'Hi', body: 'short' });
    expect(res.status).toBe(422);
    const html = visible(await res.text());
    expect(html).toContain('Choose a rating.');
    expect(html).toContain('Give it a title of at least 3 characters.');
  });

  it('answers submitForm with JSON: 200 redirect or 422 IntentRejected', async () => {
    const ok = await buyer.submitForm('/p/lego/review', REVIEW);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ _tag: 'Redirected' });
    const dup = await buyer.submitForm('/p/lego/review', REVIEW);
    expect(dup.status).toBe(422);
    expect(await dup.json()).toMatchObject({ _tag: 'IntentRejected' });
  });

  it('rejects a post without the CSRF token', async () => {
    const res = await test.get('/p/lego/review', {
      method: 'POST',
      headers: { cookie: buyer.cookie },
      body: new URLSearchParams(REVIEW),
    });
    expect(res.status).toBe(403);
  });
});

describe('helpful votes', () => {
  let reviewId: number;
  beforeEach(async () => {
    const created = await submitReview(test.db, 'lego', await idOf('grace@example.com'), {
      rating: 5,
      title: 'Great',
      body: 'Really liked building this.',
    });
    if (!created.ok) throw new Error('review');
    reviewId = created.value.id;
  });

  it('counts a no-JS vote once and returns to the page it came from', async () => {
    const path = `/reviews/${String(reviewId)}/helpful`;
    const res = await other.get(path, {
      method: 'POST',
      headers: {
        referer: 'http://localhost/p/lego',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ _csrf: other.session.csrfToken }),
    });
    expect([res.status, res.headers.get('location')]).toEqual([
      303,
      `/p/lego#review-${String(reviewId)}`,
    ]);
    expect(flashOf(res)).toContain('Thanks, your vote was counted.');
    const again = await other.postForm(path);
    expect(flashOf(again)).toContain('You already found this review helpful.');
    const [row] = await test.db.select().from(reviews).where(eq(reviews.id, reviewId));
    expect(row?.helpfulCount).toBe(1);
  });

  it('answers JSON votes with the new count, or a reason', async () => {
    const path = `/reviews/${String(reviewId)}/helpful`;
    const ok = await other.postJson(path, {});
    expect([ok.status, await ok.json()]).toEqual([200, { helpfulCount: 1 }]);
    const own = await buyer.postJson(path, {});
    expect([own.status, await own.json()]).toEqual([
      409,
      { message: "You can't vote on your own review." },
    ]);
  });

  it('requires a member', async () => {
    const res = await (await guest(test)).postForm(`/reviews/${String(reviewId)}/helpful`);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/account/login');
  });
});

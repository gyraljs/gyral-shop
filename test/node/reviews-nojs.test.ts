// Reviews without JavaScript (docs/product-specs/wishlist-reviews.md, quality.md): a verified
// purchaser writes a review from the product page, and another member marks it helpful.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reviews } from '../../src/db/schema/commerce.js';
import { submitReview } from '../../src/services/reviews.js';
import { testApp, type TestApp } from '../support/app.js';
import { createMember, loginAs, type TestSession } from '../support/auth.js';
import { insertCartFixture, SKU, T0 } from '../support/cart-fixture.js';
import { placeOrder } from '../support/orders.js';
import { closeBrowser, listen, openPage, type Served } from '../support/server.js';

let test: TestApp;
let served: Served;
let grace: TestSession;
let alan: TestSession;

beforeAll(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  await insertCartFixture(test.db);
  for (const [name, email] of [
    ['Grace Hopper', 'grace@example.com'],
    ['Alan Turing', 'alan@example.com'],
  ] as const) {
    await createMember(test, { name, email, password: 'correct-horse-battery-9' });
  }
  grace = await loginAs(test, 'grace@example.com');
  alan = await loginAs(test, 'alan@example.com');
  await placeOrder(grace, { sku: SKU.lego });
  served = await listen(test);
});

afterAll(async () => {
  await closeBrowser();
  await served.close();
});

const signedIn = async (who: TestSession) => {
  const page = await openPage({ javaScript: false });
  await page.context().addCookies([{ name: 'sid', value: who.session.id, url: served.url('/') }]);
  return page;
};

describe('reviews without JavaScript', () => {
  it('a buyer writes a review; another member finds it helpful', async () => {
    const page = await signedIn(grace);
    await page.goto(served.url('/p/lego'));
    await page.getByRole('link', { name: 'Write a review' }).click();
    await page.waitForURL(/\/p\/lego\/review$/);
    await page.getByLabel('Your rating').selectOption('4');
    // Invalid input never leaves the browser here (native minlength/required); the server's
    // 422 re-render is covered by test/node/reviews.test.ts.
    await page.getByLabel('Title').fill('Great set');
    await page.getByLabel('Your review').fill('Sturdy bricks, clear instructions, happy kids.');
    await page.getByRole('button', { name: 'Post review' }).click();
    await page.waitForURL(/\/p\/lego\/reviews\?sort=newest#review-\d+$/);
    expect(await page.locator('[data-component="review-notice"]').textContent()).toContain(
      'review is posted',
    );
    expect(await page.getByRole('heading', { name: 'Great set' }).isVisible()).toBe(true);
    await page.close();

    const voter = await signedIn(alan);
    await voter.goto(served.url('/p/lego'));
    await voter.getByRole('button', { name: 'Helpful' }).click();
    await voter.waitForURL(/\/p\/lego#review-\d+$/);
    expect(await voter.getByText('1 person found this helpful').isVisible()).toBe(true);
    expect(await voter.getByText('You found this helpful').isVisible()).toBe(true);
    await voter.close();
  }, 30_000);

  it('sorts reviews with plain links', async () => {
    const [own] = await test.db.select({ id: reviews.id }).from(reviews).limit(1);
    if (own === undefined) {
      await submitReview(test.db, 'lego', grace.session.userId ?? 0, {
        rating: 5,
        title: 'Lovely',
        body: 'Kept everyone busy for hours.',
      });
    }
    const page = await openPage({ javaScript: false });
    await page.goto(served.url('/p/lego/reviews'));
    await page.getByRole('link', { name: 'Newest' }).click();
    await page.waitForURL(/\/p\/lego\/reviews\?sort=newest$/);
    expect(await page.getByRole('heading', { level: 1 }).textContent()).toContain(
      'Reviews of LEGO',
    );
    await page.close();
  }, 20_000);
});

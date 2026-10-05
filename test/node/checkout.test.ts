// Checkout routes (docs/product-specs/checkout.md): every step on the no-JS path (303 / 422
// re-render) and the JS path (JSON view / 422 IntentRejected), plus the cart guards.
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { addresses } from '../../src/db/schema/accounts.js';
import { variants } from '../../src/db/schema/catalog.js';
import { parseCheckout } from '../../src/ui/checkout/model.js';
import { CSRF_FIELD, CSRF_HEADER } from '../../src/ui/forms/csrf.js';
import { testApp, type TestApp } from '../support/app.js';
import { guest, loginAs, type TestSession } from '../support/auth.js';
import { pinTokens } from '../support/fixtures.js';
import { insertCartFixture, SKU, T0 } from '../support/cart-fixture.js';

let test: TestApp;
let visitor: TestSession;

beforeEach(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  await insertCartFixture(test.db);
  visitor = await guest(test);
});

const ADDRESS = {
  addressId: 'new',
  name: 'Ada Lovelace',
  line1: '1 Analytical Way',
  line2: '',
  city: 'Albany',
  state: 'NY',
  postalCode: '12207',
  phone: '',
};
const CARD = { number: '4242 4242 4242 4242', expiry: '12/30', cvc: '123' };

/** A submitForm-style post: form body, CSRF header, Accept JSON. */
const postJsonForm = (who: TestSession, path: string, fields: Record<string, string>) =>
  test.get(path, {
    method: 'POST',
    headers: {
      cookie: who.cookie,
      accept: 'application/json',
      [CSRF_HEADER]: who.session.csrfToken,
    },
    body: new URLSearchParams(fields),
  });

/** The open step's data-step attribute in the server-rendered checkout. */
const openStep = (page: string) =>
  /data-step="(\w+)"[^>]*aria-current="step"/.exec(page.replace(/\s+/g, ' '))?.[1];

async function fillToReview(who: TestSession) {
  for (const [path, fields] of [
    ['/checkout/contact', { email: 'ada@example.com' }],
    ['/checkout/address', ADDRESS],
    ['/checkout/shipping', { method: 'standard' }],
    ['/checkout/payment', CARD],
  ] as const) {
    const res = await who.postForm(path, fields);
    expect(res.status, path).toBe(303);
  }
}

describe('guards', () => {
  it('sends an empty cart back to /cart (HTML and JSON)', async () => {
    const page = await visitor.get('/checkout');
    expect(page.status).toBe(303);
    expect(page.headers.get('location')).toBe('/cart');
    const json = await postJsonForm(visitor, '/checkout/contact', { email: 'a@b.co' });
    expect(await json.json()).toEqual({ _tag: 'Redirected', location: '/cart' });
  });

  it('sends a cart with line issues back to /cart', async () => {
    await visitor.postForm('/cart/add', { sku: SKU.lego, quantity: '1' });
    await test.db.update(variants).set({ stock: 0 }).where(eq(variants.sku, SKU.lego));
    const page = await visitor.get('/checkout');
    expect(page.headers.get('location')).toBe('/cart');
  });
});

describe('no-JS steps', () => {
  beforeEach(async () => {
    await visitor.postForm('/cart/add', { sku: SKU.lego, quantity: '2' });
  });

  it('renders the checkout noindex with contact open and the order summary', async () => {
    const res = await visitor.get('/checkout');
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain('<meta name="robots" content="noindex"');
    expect(page).toContain('data-region="checkout"');
    expect(openStep(page)).toBe('contact');
    expect(page).toContain('data-component="order-summary"');
    expect(page).toContain('$100.00');
    expect(page).toContain(`name="${CSRF_FIELD}"`);
  });

  it('re-renders a step with its errors (422) and moves on when valid (303)', async () => {
    const bad = await visitor.postForm('/checkout/contact', { email: 'nope' });
    expect(bad.status).toBe(422);
    const badPage = await bad.text();
    expect(badPage).toContain('Enter a valid email address.');
    expect(openStep(badPage)).toBe('contact');

    expect((await visitor.postForm('/checkout/contact', { email: 'ada@example.com' })).status).toBe(
      303,
    );
    const missingCity = await visitor.postForm('/checkout/address', { ...ADDRESS, city: '' });
    expect(missingCity.status).toBe(422);
    expect(await missingCity.text()).toContain('Enter the city.');
  });

  it('never echoes card fields back into the page', async () => {
    await visitor.postForm('/checkout/contact', { email: 'ada@example.com' });
    await visitor.postForm('/checkout/address', ADDRESS);
    await visitor.postForm('/checkout/shipping', { method: 'standard' });
    const bad = await visitor.postForm('/checkout/payment', {
      ...CARD,
      number: '4242 4242 4242 4241',
      cvc: '987',
    });
    expect(bad.status).toBe(422);
    // The CSRF token is random base64url and can contain "987" by chance: pin it first.
    const page = pinTokens(await bad.text());
    expect(page).toContain('Enter a valid card number.');
    expect(page).not.toContain('4242 4242 4242 4241');
    expect(page).not.toContain('987');
  });

  it('reaches review with tax for the address state and the saved card summary', async () => {
    await fillToReview(visitor);
    const page = await (await visitor.get('/checkout')).text();
    expect(openStep(page)).toBe('review');
    expect(page).toContain('Visa ending 4242, expires 12/30');
    expect(page).toContain('$4.00'); // 4% New York tax on $100, free standard shipping
    expect(page).toContain('$104.00');
    expect(page).toContain('action="/checkout/place"');
  });

  it('opens a saved step for editing with ?edit=, but never skips ahead', async () => {
    await visitor.postForm('/checkout/contact', { email: 'ada@example.com' });
    expect(openStep(await (await visitor.get('/checkout?edit=contact')).text())).toBe('contact');
    expect(openStep(await (await visitor.get('/checkout?edit=payment')).text())).toBe('address');
  });

  it('validates the review form, then places the order (303 to the confirmation)', async () => {
    await fillToReview(visitor);
    const noTerms = await visitor.postForm('/checkout/place', {});
    expect(noTerms.status).toBe(422);
    expect(await noTerms.text()).toContain('Accept the terms to place your order.');
    const page = await (await visitor.get('/checkout')).text();
    const key = /name="key"\s+value="([^"]+)"/.exec(page)?.[1] ?? '';
    const placed = await visitor.postForm('/checkout/place', { terms: 'on', key });
    expect(placed.status).toBe(303);
    expect(placed.headers.get('location')).toMatch(/^\/order\/GG-/);
  });
});

describe('JS path (submitForm)', () => {
  beforeEach(async () => {
    await visitor.postForm('/cart/add', { sku: SKU.lego, quantity: '1' });
  });

  it('answers a valid step with the next view and an invalid one with 422 IntentRejected', async () => {
    const ok = await postJsonForm(visitor, '/checkout/contact', { email: 'ada@example.com' });
    expect(ok.status).toBe(200);
    const view = parseCheckout(await ok.json());
    expect(view?.open).toBe('address');
    expect(view?.email).toBe('ada@example.com');

    const bad = await postJsonForm(visitor, '/checkout/address', { ...ADDRESS, postalCode: '12' });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({
      _tag: 'IntentRejected',
      intent: 'Address',
      issues: [{ path: 'postalCode', message: 'Enter a 5-digit ZIP code.' }],
    });
  });

  it('rejects a step without the CSRF header', async () => {
    const res = await test.get('/checkout/contact', {
      method: 'POST',
      headers: { cookie: visitor.cookie, accept: 'application/json' },
      body: new URLSearchParams({ email: 'ada@example.com' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('members', () => {
  it('starts at the address step with their email and can save the address', async () => {
    const ann = await loginAs(test, 'ann@example.com');
    await ann.postForm('/cart/add', { sku: SKU.tv, quantity: '1' });
    const page = await (await ann.get('/checkout')).text();
    expect(openStep(page)).toBe('address');
    expect(page).toContain('ann@example.com');
    expect((await ann.postForm('/checkout/address', { ...ADDRESS, save: 'on' })).status).toBe(303);
    expect(await test.db.select().from(addresses)).toHaveLength(1);
    const edit = await (await ann.get('/checkout?edit=address')).text();
    expect(edit).toContain('A new address (below)');
  });
});

describe('fixtures for the browser test', () => {
  it('writes the address-step page and the JSON views the next steps answer with', async () => {
    await visitor.postForm('/cart/add', { sku: SKU.lego, quantity: '2' });
    await visitor.postForm('/checkout/contact', { email: 'ada@example.com' });
    const page = await (await visitor.get('/checkout')).text();
    expect(openStep(page)).toBe('address');
    await expect(page.replaceAll(visitor.session.csrfToken, 'test-csrf-token')).toMatchFileSnapshot(
      '../fixtures/checkout.ssr.html',
    );
    const afterAddress: unknown = await (
      await postJsonForm(visitor, '/checkout/address', ADDRESS)
    ).json();
    await expect(`${JSON.stringify(afterAddress, null, 2)}\n`).toMatchFileSnapshot(
      '../fixtures/checkout-shipping.json',
    );
    const afterShipping: unknown = await (
      await postJsonForm(visitor, '/checkout/shipping', { method: 'express' })
    ).json();
    await expect(`${JSON.stringify(afterShipping, null, 2)}\n`).toMatchFileSnapshot(
      '../fixtures/checkout-payment.json',
    );
  });
});

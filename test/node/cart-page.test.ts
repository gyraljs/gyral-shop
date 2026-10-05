// The cart page and the store seed every page carries (docs/product-specs/cart.md).
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { variants } from '../../src/db/schema/catalog.js';
import { FLASH_COOKIE } from '../../src/server/flash.js';
import { parseServerCart } from '../../src/ui/cart/model.js';
import { testApp, type TestApp } from '../support/app.js';
import { guest, loginAs, type TestSession } from '../support/auth.js';
import { insertCartFixture, SKU, T0 } from '../support/cart-fixture.js';

let test: TestApp;
let visitor: TestSession;

beforeEach(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  await insertCartFixture(test.db);
  visitor = await guest(test);
});

/** The cart store state seeded into a page (Gyral ADR 0013). */
function seededCart(page: string): { itemCount: number; lines: { sku: string }[] } {
  const json = /<script type="application\/json" data-gyral-stores>([\s\S]*?)<\/script>/.exec(page);
  if (json?.[1] === undefined) throw new Error('no store seed');
  const seed = JSON.parse(json[1]) as {
    cart: { cart: { itemCount: number; lines: { sku: string }[] } };
  };
  return seed.cart.cart;
}

/** The flash cookie a redirect set, as a request `Cookie` value. */
const flashCookie = (response: Response) =>
  response.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${FLASH_COOKIE}=`))
    ?.split(';')[0];

describe('/cart', () => {
  it('shows an empty cart to a new visitor, with a session for its forms', async () => {
    const response = await test.get('/cart');
    expect(response.status).toBe(200);
    const page = await response.text();
    expect(page).toContain('<meta name="robots" content="noindex"');
    expect(page).toContain('Your cart is empty.');
    expect(response.headers.getSetCookie().join()).toMatch(/sid=/);
    expect(seededCart(page)).toMatchObject({ itemCount: 0, lines: [] });
  });

  it('lists lines with no-JS forms and totals after an add, and shows the flash once', async () => {
    const added = await visitor.postForm('/cart/add', { sku: SKU.lego, quantity: '2' });
    const flash = flashCookie(added);
    expect(flash).toBeDefined();
    // test.get, not visitor.get: the helper would replace this Cookie header with its own.
    const response = await test.get('/cart', {
      headers: { cookie: `${visitor.cookie}; ${flash ?? ''}` },
    });
    const page = await response.text();
    expect(page).toContain('Added 2 items of LEGO to your cart.');
    expect(response.headers.getSetCookie().join()).toMatch(/flash=;.*Max-Age=0/);
    expect(page).toMatch(/<form method="post" action="\/cart\/update"[^>]*>/);
    expect(page).toMatch(/<form method="post" action="\/cart\/remove"[^>]*>/);
    expect(page).toMatch(/<form method="post" action="\/cart\/promo"[^>]*>/);
    expect(page).toContain(`name="_csrf" value="${visitor.session.csrfToken}"`);
    expect(page).toContain('$100.00'); // 2 × $50 line total and subtotal
    expect(page).toMatch(/<a class="button primary" href="\/checkout">/);
    expect(seededCart(page)).toMatchObject({ itemCount: 2, lines: [{ sku: SKU.lego }] });

    const again = await (await visitor.get('/cart')).text();
    expect(again).not.toContain('Added 2 items of LEGO');
  });

  it('marks lines that can no longer be bought and blocks checkout', async () => {
    await visitor.postForm('/cart/add', { sku: SKU.lego, quantity: '3' });
    await test.db.update(variants).set({ stock: 1 }).where(eq(variants.sku, SKU.lego));
    const page = await (await visitor.get('/cart')).text();
    expect(page).toContain('Only 1 available.');
    expect(page).toMatch(/<button[^>]*disabled[^>]*aria-describedby="checkout-blocked"/);
    expect(page).not.toMatch(/href="\/checkout"/.source + '>Checkout');
  });

  it('seeds the header mini-cart on every page with the visitor’s own cart', async () => {
    await visitor.postForm('/cart/add', { sku: SKU.tv, quantity: '1' });
    const page = await (await visitor.get('/')).text();
    expect(seededCart(page)).toMatchObject({ itemCount: 1 });
    expect(page).toMatch(/<shop-mini-cart/);
    expect(page).toMatch(/class="badge"[^>]*>(<!--[^>]*-->)*1</);
    // Another visitor's page carries an empty cart.
    const other = await guest(test);
    expect(seededCart(await (await other.get('/')).text())).toMatchObject({ itemCount: 0 });
  });

  it('seeds members’ carts too', async () => {
    const member = await loginAs(test, 'ann@example.com');
    await member.postForm('/cart/add', { sku: SKU.lego, quantity: '4' });
    expect(seededCart(await (await member.get('/cart')).text())).toMatchObject({ itemCount: 4 });
  });

  it('answers the JSON API in a shape the browser model parses', async () => {
    await visitor.postForm('/cart/add', { sku: SKU.tv, quantity: '2' });
    const body = (await (await visitor.get('/api/cart')).json()) as { cart: unknown };
    const cart = parseServerCart(body.cart);
    expect(cart.itemCount).toBe(2);
    expect(cart.totals.subtotal.cents).toBe(90_000); // on sale: 2 × $450
    expect(cart.totals.savings.cents).toBe(10_000);
  });

  it('produces the markup the browser cart test hydrates', async () => {
    await visitor.postForm('/cart/add', { sku: SKU.tv, quantity: '2' });
    await visitor.postForm('/cart/add', { sku: SKU.lego, quantity: '3' });
    const page = await (await visitor.get('/cart')).text();
    await expect(page.replaceAll(visitor.session.csrfToken, 'test-csrf-token')).toMatchFileSnapshot(
      '../fixtures/cart.ssr.html',
    );
  });
});

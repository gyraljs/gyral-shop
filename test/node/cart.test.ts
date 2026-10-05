// Cart HTTP surface: no-JS forms (PRG + flash) and the JSON API (docs/product-specs/cart.md).
import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { FLASH_COOKIE, takeFlash } from '../../src/server/flash.js';
import { startMemberSession, type AppEnv } from '../../src/server/security/index.js';
import { attachRuntime } from '../../src/server/security/runtime.js';
import { addToCart, viewCart } from '../../src/services/cart.js';
import { CSRF_HEADER } from '../../src/ui/forms/csrf.js';
import { testApp, type TestApp } from '../support/app.js';
import { guest, type TestSession } from '../support/auth.js';
import { insertCartFixture, SKU, T0 } from '../support/cart-fixture.js';

let test: TestApp;
let visitor: TestSession;
let userId: number;

beforeEach(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  ({ userId } = await insertCartFixture(test.db));
  visitor = await guest(test);
});

/** The flash message a redirect carried. */
function flashOf(response: Response): unknown {
  const cookie = response.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${FLASH_COOKIE}=`))
    ?.split(';')[0]
    ?.slice(FLASH_COOKIE.length + 1);
  return cookie === undefined ? undefined : JSON.parse(decodeURIComponent(cookie));
}

/** A JSON request with any method, the session cookie and the CSRF header. */
const send = (session: TestSession, method: string, path: string, body?: unknown) =>
  test.get(path, {
    method,
    headers: {
      cookie: session.cookie,
      'content-type': 'application/json',
      [CSRF_HEADER]: session.session.csrfToken,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

interface CartJson {
  readonly cart: { readonly itemCount: number; readonly lines: readonly { sku: string }[] };
  readonly notice?: string;
  readonly error?: { readonly _tag: string; readonly message: string };
}
const json = async (response: Response) => (await response.json()) as CartJson;

describe('cart forms (no JS)', () => {
  it('adds an item, then redirects to /cart with a success flash', async () => {
    const response = await visitor.postForm('/cart/add', { sku: SKU.lego, quantity: '2' });
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/cart');
    expect(flashOf(response)).toEqual({
      kind: 'success',
      message: 'Added 2 items of LEGO to your cart.',
    });
    expect((await json(await visitor.get('/api/cart'))).cart.itemCount).toBe(2);
  });

  it('updates, removes and applies promos through forms', async () => {
    await visitor.postForm('/cart/add', { sku: SKU.lego, quantity: '1' });
    await visitor.postForm('/cart/update', { sku: SKU.lego, quantity: '3' });
    expect((await json(await visitor.get('/api/cart'))).cart.itemCount).toBe(3);
    const promo = await visitor.postForm('/cart/promo', { code: 'welcome10' });
    expect(flashOf(promo)).toEqual({ kind: 'success', message: 'Promo code WELCOME10 applied.' });
    await visitor.postForm('/cart/remove', { sku: SKU.lego });
    expect((await json(await visitor.get('/api/cart'))).cart.lines).toEqual([]);
  });

  it('turns invalid input and cart errors into error flashes', async () => {
    const invalid = await visitor.postForm('/cart/add', { sku: SKU.lego, quantity: 'lots' });
    expect(invalid.status).toBe(303);
    expect(flashOf(invalid)).toMatchObject({ kind: 'error' });
    const soldOut = await visitor.postForm('/cart/add', { sku: SKU.apple });
    expect(flashOf(soldOut)).toEqual({ kind: 'error', message: 'APPLE is out of stock.' });
  });

  it('refuses form posts without the CSRF token', async () => {
    const response = await test.get('/cart/add', {
      method: 'POST',
      headers: { cookie: visitor.cookie },
      body: new URLSearchParams({ sku: SKU.lego }),
    });
    expect(response.status).toBe(403);
    expect(
      (await viewCart(test.db, { kind: 'guest', sessionId: visitor.session.id }, T0)).lines,
    ).toEqual([]);
  });
});

describe('cart JSON API', () => {
  it('returns an empty cart to visitors without a session, without starting one', async () => {
    const response = await test.get('/api/cart');
    expect(response.status).toBe(200);
    expect((await json(response)).cart.itemCount).toBe(0);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('adds, updates and deletes lines, answering with the full cart each time', async () => {
    const added = await json(
      await visitor.postJson('/api/cart/items', { sku: SKU.lego, quantity: 2 }),
    );
    expect(added.notice).toBe('Added 2 items of LEGO to your cart.');
    expect(added.cart.itemCount).toBe(2);
    const updated = await json(
      await send(visitor, 'PATCH', `/api/cart/items/${SKU.lego}`, { quantity: 4 }),
    );
    expect(updated.cart.itemCount).toBe(4);
    const deleted = await json(await send(visitor, 'DELETE', `/api/cart/items/${SKU.lego}`));
    expect(deleted.cart.itemCount).toBe(0);
  });

  it('maps cart errors to statuses and keeps returning the cart', async () => {
    const unknown = await visitor.postJson('/api/cart/items', { sku: 'NOPE-1' });
    expect(unknown.status).toBe(404);
    const soldOut = await visitor.postJson('/api/cart/items', { sku: SKU.apple });
    expect(soldOut.status).toBe(409);
    expect((await json(soldOut)).error).toEqual({
      _tag: 'OutOfStock',
      message: 'APPLE is out of stock.',
    });
    const promo = await visitor.postJson('/api/cart/promo', { code: 'NOPE' });
    expect(promo.status).toBe(422);
    expect((await json(promo)).cart.itemCount).toBe(0);
  });

  it('rejects malformed input with 400 and the failing fields', async () => {
    const response = await visitor.postJson('/api/cart/items', { sku: '', quantity: -1 });
    expect(response.status).toBe(400);
    expect((await json(response)).error?._tag).toBe('InvalidInput');
  });

  it('refuses JSON writes without the CSRF header', async () => {
    const response = await test.get('/api/cart/items', {
      method: 'POST',
      headers: { cookie: visitor.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ sku: SKU.lego }),
    });
    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toContain('application/json');
  });
});

describe('login merges the guest cart', () => {
  it('startMemberSession folds the guest cart into the member cart', async () => {
    await addToCart(test.db, { kind: 'member', userId }, SKU.lego, 3);
    await visitor.postForm('/cart/add', { sku: SKU.lego, quantity: '2' });
    await visitor.postForm('/cart/add', { sku: SKU.tv, quantity: '1' });

    // A minimal login route: the real one (accounts bead) calls the same helper.
    const app = new Hono<AppEnv>();
    app.use('*', async (c, next) => {
      attachRuntime(c, {
        db: test.db,
        now: () => T0,
        render: () => new Response(null, { status: 403 }),
      });
      c.set('session', visitor.session);
      c.set('user', undefined);
      await next();
    });
    app.post('/login', async (c) => {
      await startMemberSession(c, {
        id: userId,
        email: 'ann@example.com',
        name: 'Ann',
        role: 'customer',
      });
      return c.body(null, 204);
    });
    expect((await app.request('/login', { method: 'POST' })).status).toBe(204);

    const cart = await viewCart(test.db, { kind: 'member', userId }, T0);
    expect(Object.fromEntries(cart.lines.map((l) => [l.sku, l.quantity]))).toEqual({
      [SKU.lego]: 5,
      [SKU.tv]: 1,
    });
  });
});

describe('flash messages', () => {
  it('are read once', async () => {
    const app = new Hono();
    app.get('/', (c) => c.json(takeFlash(c) ?? null));
    const flash = encodeURIComponent(JSON.stringify({ kind: 'success', message: 'Hi' }));
    const response = await app.request('/', { headers: { cookie: `${FLASH_COOKIE}=${flash}` } });
    expect(await response.json()).toEqual({ kind: 'success', message: 'Hi' });
    expect(response.headers.getSetCookie().join()).toMatch(/flash=;.*Max-Age=0/);
    const forged = await app.request('/', { headers: { cookie: `${FLASH_COOKIE}=%7Bnope` } });
    expect(await forged.json()).toBeNull();
  });
});

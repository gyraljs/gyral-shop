// The Zen Garden contract (ADR 0006 rules 2 and 5): every page template exposes the stable
// hooks a theme may target, and page content sits in light DOM, outside any server-rendered
// shadow root, so document CSS (themes) can re-lay it out and raw-HTML crawlers can read it.
import { beforeAll, describe, expect, it } from 'vitest';
import { testApp, type TestApp } from '../support/app.js';
import { createMember, guest, loginAs, type TestSession } from '../support/auth.js';

/** The markup with every `<template shadowrootmode>…</template>` removed (nesting-aware). */
function lightDom(html: string): string {
  let out = '';
  let depth = 0;
  for (const piece of html.split(/(<template\b[^>]*>|<\/template>)/)) {
    if (piece.startsWith('<template')) {
      if (depth > 0 || piece.includes('shadowrootmode')) depth += 1;
      else out += piece;
    } else if (piece === '</template>') {
      if (depth > 0) depth -= 1;
      else out += piece;
    } else if (depth === 0) {
      out += piece;
    }
  }
  return out;
}

const regions = (html: string): Set<string> =>
  new Set([...html.matchAll(/data-region="([\w-]+)"/g)].map((m) => m[1] ?? ''));

/** Regions every storefront page carries (the light-DOM header). */
const SHELL = ['header', 'masthead', 'search', 'account', 'cart', 'nav'];

let test: TestApp;
let member: TestSession;
let shopper: TestSession;
let paths: { department: string; category: string; product: string };

beforeAll(async () => {
  test = await testApp();
  await createMember(test, {
    name: 'Grace Hopper',
    email: 'grace@example.com',
    password: 'correct-horse-battery-9',
  });
  member = await loginAs(test, 'grace@example.com');
  const home = await test.html('/');
  const first = (re: RegExp, html: string) => re.exec(html)?.[1] ?? '';
  const department = first(/href="(\/d\/[\w-]+)"/, home);
  const category = first(/href="(\/c\/[\w-]+\/[\w-]+)"/, await test.html(department));
  const product = first(/href="(\/p\/[\w-]+)"/, await test.html(category));
  paths = { department, category, product };
  shopper = await guest(test);
  const productHtml = await (await shopper.get(product)).text();
  const sku = first(/name="sku"[^>]*value="([^"]+)"/, productHtml);
  expect((await shopper.postForm('/cart/add', { sku, quantity: '1' })).status).toBe(303);
});

describe('theme hooks on every page template (ADR 0006)', () => {
  const cases: [
    string,
    () => Promise<string>,
    readonly string[],
    { products?: boolean; form?: boolean },
  ][] = [
    ['home', () => test.html('/'), ['hero', 'departments'], { products: true }],
    ['department', () => test.html(paths.department), ['page-intro', 'categories'], {}],
    [
      'category',
      () => test.html(paths.category),
      ['category', 'listing', 'filters', 'results'],
      { products: true },
    ],
    ['search', () => test.html('/search?q=a'), ['listing', 'results'], { products: true }],
    [
      'product',
      () => test.html(paths.product),
      ['product', 'product-info', 'gallery', 'buy-box', 'description', 'reviews'],
      {},
    ],
    [
      'cart',
      async () => (await shopper.get('/cart')).text(),
      ['cart-lines', 'cart-summary'],
      { form: true },
    ],
    ['checkout', async () => (await shopper.get('/checkout')).text(), ['checkout'], { form: true }],
    ['sign in', () => test.html('/account/login'), ['auth'], { form: true }],
    ['register', () => test.html('/account/register'), ['auth'], { form: true }],
    ['about', () => test.html('/about'), ['content'], {}],
    ['contact', () => test.html('/contact'), ['content'], { form: true }],
    ['order lookup', () => test.html('/order/lookup'), ['order-lookup'], { form: true }],
    ['account', async () => (await member.get('/account')).text(), ['account'], {}],
    ['orders', async () => (await member.get('/account/orders')).text(), ['order-history'], {}],
    ['wishlist', async () => (await member.get('/account/wishlist')).text(), ['wishlist'], {}],
  ];

  it.each(cases)('%s exposes its regions with content in light DOM', async (_, load, own, want) => {
    const html = await load();
    const light = lightDom(html);
    const found = regions(light);
    for (const region of [...SHELL, ...own])
      expect(found, `data-region="${region}"`).toContain(region);
    expect(light).toMatch(/<h1[\s>]/);
    if (want.products === true) {
      expect(light).toMatch(/href="\/p\/[\w-]+"/);
      expect(light).toMatch(/\$\d/);
    }
    if (want.form === true) expect(light).toMatch(/<form[\s>]/);
  });

  it('keeps widgets in shadow DOM with documented parts (gallery, buy box, mini-cart)', async () => {
    const html = await test.html(paths.product);
    for (const part of ['gallery', 'view', 'price', 'stock', 'quantity', 'add-button']) {
      expect(html).toContain(`part="${part}"`);
    }
    // …and those parts live inside the widgets' shadow roots, which lightDom() removes.
    expect(lightDom(html)).not.toContain('part="view"');
  });
});

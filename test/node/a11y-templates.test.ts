// axe on every page template (docs/product-specs/quality.md, "Accessibility"). Each template
// is served by the real app (no client bundle in tests) and loaded in Chromium, so axe sees
// the server-rendered markup (Declarative Shadow DOM included) that every visitor gets first.
// Hydrated states are covered by the browser tests (test/browser/*), which also run axe.
// Templates not covered here: /admin (client-rendered; test/browser/admin*.test.ts run axe) and
// /dev/mail (development tool, not a shopper page).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { variants } from '../../src/db/schema/catalog.js';
import { SESSION_COOKIE } from '../../src/server/security/index.js';
import { issueReset } from '../../src/services/password-reset.js';
import { testApp, type TestApp } from '../support/app.js';
import { createMember, guest, loginAs, type TestSession } from '../support/auth.js';
import { insertCartFixture, SKU, T0 } from '../support/cart-fixture.js';
import { ADDRESS, placeOrder, TEST_CARD } from '../support/orders.js';
import type { Page } from 'playwright';
import { closeBrowser, listen, openPage, type Served } from '../support/server.js';

const AXE_SOURCE = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

interface Template {
  readonly name: string;
  readonly path: string;
  readonly as?: TestSession;
  readonly status?: number;
}

let test: TestApp;
let served: Served;
const templates: Template[] = [];

const advance = async (who: TestSession, path: string, fields: Record<string, string>) => {
  expect((await who.postForm(path, fields)).status, path).toBe(303);
};

beforeAll(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  // Routes must be added before the app handles its first request.
  test.app.get('/__boom', () => {
    throw new Error('a11y suite: forced failure');
  });
  await insertCartFixture(test.db);
  await createMember(test, {
    name: 'Grace Hopper',
    email: 'grace@example.com',
    password: 'correct-horse-battery-9',
  });
  const member = await loginAs(test, 'grace@example.com');
  const orderNumber = await placeOrder(member, { sku: SKU.lego });
  await member.postForm('/wishlist/add', { product: 'tv' });

  // A guest walking through checkout: one session per step, so each step's page is captured.
  const checkoutAt = async (steps: number): Promise<TestSession> => {
    const who = await guest(test);
    await advance(who, '/cart/add', { sku: SKU.lego, quantity: '1' });
    const flow: [string, Record<string, string>][] = [
      ['/checkout/contact', { email: 'ada@example.com' }],
      ['/checkout/address', { ...ADDRESS }],
      ['/checkout/shipping', { method: 'standard' }],
      ['/checkout/payment', { number: TEST_CARD, expiry: '12/30', cvc: '123' }],
    ];
    for (const [path, fields] of flow.slice(0, steps)) await advance(who, path, fields);
    return who;
  };
  const emptyCart = await guest(test);
  const filledCart = await checkoutAt(0);
  const issuesCart = await guest(test);
  await advance(issuesCart, '/cart/add', { sku: SKU.tv, quantity: '2' });
  await test.db.update(variants).set({ stock: 1 }).where(eq(variants.sku, SKU.tv));
  const reset = await issueReset(test.db, 'grace@example.com', T0);
  if (reset === undefined) throw new Error('no reset token');

  served = await listen(test);

  templates.push(
    { name: 'home', path: '/' },
    { name: 'department', path: '/d/electronics' },
    { name: 'category', path: '/c/electronics/tv' },
    { name: 'filtered listing', path: '/c/electronics/tv?sale=1&sort=price-asc' },
    { name: 'search results', path: '/search?q=lego' },
    { name: 'search no results', path: '/search?q=zzqqxx' },
    { name: 'search without query', path: '/search' },
    { name: 'product', path: '/p/tv' },
    { name: 'reviews page', path: '/p/lego/reviews' },
    { name: 'review form', path: '/p/lego/review', as: member },
    { name: 'cart empty', path: '/cart', as: emptyCart },
    { name: 'cart filled', path: '/cart', as: filledCart },
    { name: 'cart with issues', path: '/cart', as: issuesCart },
    { name: 'checkout contact', path: '/checkout', as: await checkoutAt(0) },
    { name: 'checkout address', path: '/checkout', as: await checkoutAt(1) },
    { name: 'checkout shipping', path: '/checkout', as: await checkoutAt(2) },
    { name: 'checkout payment', path: '/checkout', as: await checkoutAt(3) },
    { name: 'checkout review', path: '/checkout', as: await checkoutAt(4) },
    { name: 'order confirmation', path: `/order/${orderNumber}/confirmation`, as: member },
    { name: 'account', path: '/account', as: member },
    { name: 'profile', path: '/account/profile', as: member },
    { name: 'addresses', path: '/account/addresses', as: member },
    { name: 'change password', path: '/account/password', as: member },
    { name: 'order history', path: '/account/orders', as: member },
    { name: 'order detail', path: `/account/orders/${orderNumber}`, as: member },
    { name: 'wishlist', path: '/account/wishlist', as: member },
    { name: 'order lookup', path: '/order/lookup' },
    { name: 'sign in', path: '/account/login' },
    { name: 'register', path: '/account/register' },
    { name: 'forgot password', path: '/account/forgot' },
    { name: 'reset password', path: `/account/reset?token=${reset.token}` },
    { name: 'reset link invalid', path: '/account/reset?token=nope', status: 410 },
    { name: 'about', path: '/about' },
    { name: 'faq', path: '/faq' },
    { name: 'terms', path: '/terms' },
    { name: 'privacy', path: '/privacy' },
    { name: 'contact', path: '/contact' },
    { name: 'consent settings', path: '/consent' },
    { name: 'theme settings', path: '/theme' },
    { name: 'not found', path: '/no-such-page', status: 404 },
    { name: 'server error', path: '/__boom', status: 500 },
  );
}, 120_000);

afterAll(async () => {
  await closeBrowser();
  await served.close();
});

describe('axe on every page template (server-rendered markup)', () => {
  it('has no WCAG 2.2 AA violations on any template', { timeout: 240_000 }, async () => {
    // JavaScript stays on (axe needs timers), but the test app serves no client bundle, so
    // pages keep exactly their server-rendered markup.
    const page = await openPage({ javaScript: true });
    const failures: string[] = [];
    const quiet = console.error;
    console.error = () => undefined; // the forced 500 logs its error
    try {
      for (const t of templates) {
        await page.context().clearCookies();
        if (t.as !== undefined) {
          await page
            .context()
            .addCookies([{ name: SESSION_COOKIE, value: t.as.session.id, url: served.url('/') }]);
        }
        const started = Date.now();
        const response = await page
          .goto(served.url(t.path), { waitUntil: 'domcontentloaded', timeout: 15_000 })
          .catch((error: unknown) => {
            failures.push(`${t.name} (${t.path}): ${String(error).split('\n')[0] ?? ''}`);
            return undefined;
          });
        if (process.env['A11Y_TIMING'] !== undefined) console.log(t.name, Date.now() - started);
        if (response === undefined) continue;
        const status = response?.status();
        if (status !== (t.status ?? 200)) {
          failures.push(`${t.name} (${t.path}): status ${String(status)}`);
          continue;
        }
        const violations = await axeOn(page);
        for (const v of violations) failures.push(`${t.name} (${t.path}): ${v}`);
      }
    } finally {
      console.error = quiet;
    }
    expect(templates.length).toBeGreaterThanOrEqual(40);
    expect(failures).toEqual([]);
  });

  it('reports a violation on a known-bad page (control)', async () => {
    const page = await openPage({ javaScript: true });
    await page.setContent(
      '<!doctype html><html lang="en"><title>x</title><main><img src="x.png"></main></html>',
    );
    expect((await axeOn(page)).join('\n')).toContain('image-alt');
  });
});

interface AxeInPage {
  run(
    context: Document,
    options: { runOnly: { type: 'tag'; values: string[] } },
  ): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }>;
}

/** Runs axe in the page through the DevTools protocol (the shop's CSP blocks inline scripts). */
async function axeOn(page: Page): Promise<string[]> {
  await page.evaluate(AXE_SOURCE);
  return page.evaluate(async (tags) => {
    const axe = (globalThis as unknown as { axe: AxeInPage }).axe;
    const result = await axe.run(document, { runOnly: { type: 'tag', values: tags } });
    return result.violations.map(
      (v) =>
        `${v.id} → ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(', ')}`,
    );
  }, WCAG);
}

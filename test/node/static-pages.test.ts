// Pages prerendered at build time (shop-2gz): the same HTML for every visitor, even when the
// request that renders them is signed in, so nothing personal can leak into the static files.
import { writeFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { testApp, type TestApp } from '../support/app.js';
import { createMember, loginAs, type TestSession } from '../support/auth.js';
import { insertCartFixture, SKU, T0 } from '../support/cart-fixture.js';

let test: TestApp;
let member: TestSession;

beforeEach(async () => {
  test = await testApp({ seed: false, now: () => T0 });
  await insertCartFixture(test.db);
  await createMember(test, {
    name: 'Grace Hopper',
    email: 'grace@example.com',
    password: 'correct-horse-battery-9',
  });
  member = await loginAs(test, 'grace@example.com');
  await member.postForm('/cart/add', { sku: SKU.lego, quantity: '2' });
});

describe('static (ssg) content pages', () => {
  it('render without the account, CSRF token or cart, and ask to personalize', async () => {
    for (const path of ['/about', '/faq', '/terms', '/privacy']) {
      const html = await (await member.get(path)).text();
      expect(html, path).not.toContain('Hi, Grace');
      expect(html, path).not.toContain('name="csrf-token"');
      expect(html, path).not.toContain('data-gyral-stores');
      expect(html, path).toMatch(/<shop-header[^>]*\spersonalize/);
      // The banner can't be decided at build time: it asks /api/me once hydrated.
      expect(html, path).toMatch(/<shop-consent[^>]*\sdeferred/);
    }
    writeFileSync(
      new URL('../fixtures/static-about.ssr.html', import.meta.url),
      await (await test.get('/about')).text(),
    );
  });

  it('keep per-request pages personal', async () => {
    const html = await (await member.get('/')).text();
    expect(html.replace(/<!--[\s\S]*?-->/g, '')).toContain('Hi, Grace');
    expect(html).not.toMatch(/<shop-header[^>]*\spersonalize/);
  });

  it('answers /api/me for a member', async () => {
    // The member's cart as the mini-cart loads it on a static page (browser test fixture).
    writeFileSync(
      new URL('../fixtures/static-cart.json', import.meta.url),
      await (await member.get('/api/cart')).text(),
    );
    const res = await member.get('/api/me');
    expect(await res.json()).toEqual({
      account: { firstName: 'Grace', csrfToken: member.session.csrfToken },
      consentDecided: false,
      analytics: false,
    });
  });
});

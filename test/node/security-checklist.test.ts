// ADR 0002 checklist gaps found by the quality audit (shop-dok.4): admin-only APIs, and
// user-supplied content escaped everywhere it is rendered (HTML text and JSON-LD).
// The full item → test map is the "Checklist" table in docs/design-docs/0002-security.md.
import { describe, expect, it } from 'vitest';
import { requireAdmin } from '../../src/server/security/index.js';
import { submitReview } from '../../src/services/reviews.js';
import { testApp } from '../support/app.js';
import { ADMIN_EMAIL, anyCustomerEmail, createMember, guest, loginAs } from '../support/auth.js';
import { insertCartFixture, SKU, T0 } from '../support/cart-fixture.js';
import { placeOrder } from '../support/orders.js';

describe('admin-only APIs', () => {
  it('answer guests 401 and customers 403 as JSON, and admins normally', async () => {
    const test = await testApp();
    test.app.get('/api/__q/admin', requireAdmin(), (c) => c.json({ ok: true }));
    const anonymous = await test.get('/api/__q/admin');
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('content-type')).toContain('application/json');
    const customer = await loginAs(test, await anyCustomerEmail(test));
    const forbidden = await customer.get('/api/__q/admin');
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get('content-type')).toContain('application/json');
    const admin = await loginAs(test, ADMIN_EMAIL);
    expect(await (await admin.get('/api/__q/admin')).json()).toEqual({ ok: true });
  });

  it('refuses a guest session that claims nothing (no role escalation by cookie alone)', async () => {
    const test = await testApp();
    test.app.get('/api/__q/admin', requireAdmin(), (c) => c.json({ ok: true }));
    const anon = await guest(test);
    expect((await anon.get('/api/__q/admin')).status).toBe(401);
  });
});

describe('user-supplied content in rendered pages', () => {
  const PAYLOAD = '<script>alert(1)</script>';

  it('is escaped in HTML and cannot break out of JSON-LD', async () => {
    const test = await testApp({ seed: false, now: () => T0 });
    await insertCartFixture(test.db);
    await createMember(test, {
      name: `Eve ${PAYLOAD}`,
      email: 'eve@example.com',
      password: 'correct-horse-battery-9',
    });
    const eve = await loginAs(test, 'eve@example.com');
    await placeOrder(eve, { sku: SKU.lego });
    const posted = await submitReview(test.db, 'lego', eve.session.userId ?? 0, {
      rating: 5,
      title: `Nice ${PAYLOAD}`,
      body: `Body text that is long enough ${PAYLOAD}`,
    });
    expect(posted.ok).toBe(true);

    for (const path of ['/p/lego', '/p/lego/reviews']) {
      const html = await (await test.get(path)).text();
      expect(html, path).not.toContain(PAYLOAD);
      expect(html, path).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      // JSON-LD review snippets are script-safe: no "</script" inside the data.
      for (const [, json] of html.matchAll(
        /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
      )) {
        expect(json, path).not.toMatch(/<\/script/i);
      }
    }
  });
});

// Page-view beacon for prerendered pages (shop-8c2): consented, origin-verified, static paths
// only, never starts a session.
import { describe, expect, it } from 'vitest';
import { analyticsEvents } from '../../src/db/schema.js';
import { serializeConsent } from '../../src/domain/consent.js';
import { CONSENT_COOKIE } from '../../src/server/consent.js';
import { PAGE_VIEW_PATH } from '../../src/server/routes/analytics.js';
import { testApp, type TestApp } from '../support/app.js';

const ORIGIN = 'http://localhost';
const cookie = (analytics: boolean) => `${CONSENT_COOKIE}=${serializeConsent({ analytics })}`;

function beacon(test: TestApp, path: string, headers: Record<string, string> = {}) {
  return test.app.request(`${ORIGIN}${PAGE_VIEW_PATH}`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ path }),
  });
}

const rows = (test: TestApp) => test.db.select().from(analyticsEvents);

describe('POST /api/analytics/page-view', () => {
  it('records a page view of a prerendered page when the visitor accepted analytics', async () => {
    const test = await testApp();
    const res = await beacon(test, '/about', { cookie: cookie(true) });
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie()).toEqual([]); // never starts a session
    expect((await rows(test)).map((r) => [r.kind, r.path])).toEqual([['page_view', '/about']]);
  });

  it('records nothing without analytics consent, or before any choice', async () => {
    const test = await testApp();
    expect((await beacon(test, '/about', { cookie: cookie(false) })).status).toBe(204);
    expect((await beacon(test, '/about')).status).toBe(204);
    expect(await rows(test)).toEqual([]);
  });

  it('ignores paths that are not prerendered (the middleware counts those)', async () => {
    const test = await testApp();
    await beacon(test, '/cart', { cookie: cookie(true) });
    await beacon(test, '/about?x=1', { cookie: cookie(true) });
    expect(await rows(test)).toEqual([]);
  });

  it('refuses another site (origin-verified like the consent form)', async () => {
    const test = await testApp();
    const res = await beacon(test, '/about', { cookie: cookie(true), origin: 'https://evil.test' });
    expect(res.status).toBe(403);
    expect(await rows(test)).toEqual([]);
  });

  it('tells a prerendered page whether analytics was accepted (/api/me)', async () => {
    const test = await testApp();
    const me = await test.app.request(`${ORIGIN}/api/me`, { headers: { cookie: cookie(true) } });
    expect(await me.json()).toMatchObject({ consentDecided: true, analytics: true });
  });
});

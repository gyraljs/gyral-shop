// ADR 0002 checklist, one test per item, through the real app (docs/design-docs/0005-testing.md).
import { beforeEach, describe, expect, it } from 'vitest';
import {
  csrfTokenFor,
  endSession,
  limit,
  requireAdmin,
  requireUser,
  SESSION_COOKIE,
  SlidingWindowLimiter,
  startMemberSession,
} from '../../src/server/security/index.js';
import { sessionExists, SESSION_TTL_MS, TOUCH_AFTER_MS } from '../../src/services/sessions.js';
import { CSRF_FIELD, CSRF_HEADER, CSRF_META } from '../../src/ui/forms/csrf.js';
import { testApp, type TestApp } from '../support/app.js';
import { ADMIN_EMAIL, anyCustomerEmail, guest, loginAs } from '../support/auth.js';

let clock = new Date('2026-10-04T12:00:00Z');
let test: TestApp;
const limiter = () =>
  new SlidingWindowLimiter({ limit: 2, windowMs: 60_000, now: () => clock.getTime() });

/** Routes only these tests use, mounted on the real app (middleware registered first applies). */
function mountProbes(t: TestApp) {
  const attempts = limiter();
  t.app.get('/__t/token', async (c) => c.text(await csrfTokenFor(c)));
  t.app.post('/__t/echo', async (c) => {
    const form = await c.req.raw.formData(); // the body is still readable after the CSRF check
    const note = form.get('note');
    return c.text(`ok:${typeof note === 'string' ? note : ''}`);
  });
  t.app.post('/api/__t/echo', (c) => c.json({ ok: true }));
  t.app.get('/__t/member', requireUser(), (c) => c.text(`hi ${c.get('user')?.email ?? ''}`));
  t.app.get('/api/__t/member', requireUser(), (c) => c.json({ ok: true }));
  t.app.get('/__t/admin', requireAdmin(), (c) => c.text('admin'));
  t.app.post('/__t/login-as/:email', async (c) => {
    const email = c.req.param('email');
    const limited = await limit(c, attempts, [`acct:${email}`]);
    if (limited !== undefined) return limited;
    await startMemberSession(c, { id: 1, email, name: 'x', role: 'admin' });
    return c.text('in');
  });
  t.app.post('/__t/logout', async (c) => {
    await endSession(c);
    return c.text('out');
  });
}

const cookieValue = (res: Response): string | undefined =>
  res.headers
    .getSetCookie()
    .find((h) => h.startsWith(`${SESSION_COOKIE}=`))
    ?.split(';')[0]
    ?.slice(SESSION_COOKIE.length + 1);

beforeEach(async () => {
  clock = new Date('2026-10-04T12:00:00Z');
  test = await testApp({ now: () => clock });
  mountProbes(test);
});

describe('headers', () => {
  it('sends a strict CSP and the standard security headers', async () => {
    const res = await test.get('/');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('ws:');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('strict-transport-security')).toBeNull();
  });

  it('allows the HMR websocket only in development; HSTS only over HTTPS', async () => {
    const dev = await testApp({ dev: true });
    expect((await dev.get('/')).headers.get('content-security-policy')).toContain('ws:');
    const https = await test.get('https://shop.test/');
    expect(https.headers.get('strict-transport-security')).toContain('max-age=');
  });
});

describe('sessions', () => {
  it('does not create a session just for browsing', async () => {
    const res = await test.get('/');
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it('creates an anonymous session on demand with a hardened cookie', async () => {
    const res = await test.get('/__t/token');
    const header = res.headers.getSetCookie().find((h) => h.startsWith(`${SESSION_COOKIE}=`)) ?? '';
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/SameSite=Lax/);
    expect(header).toMatch(/Path=\//);
    expect(header).toContain(`Max-Age=${String(SESSION_TTL_MS / 1000)}`);
    expect(header).not.toMatch(/Secure/);
    const id = cookieValue(res);
    expect(id !== undefined && (await sessionExists(test.db, id))).toBe(true);
    expect((await test.get('https://shop.test/__t/token')).headers.getSetCookie()[0]).toMatch(
      /Secure/,
    );
  });

  it('reuses the session from the cookie and renews it when stale', async () => {
    const g = await guest(test);
    const fresh = await g.get('/__t/token');
    expect(await fresh.text()).toBe(g.session.csrfToken);
    expect(fresh.headers.getSetCookie()).toEqual([]);
    clock = new Date(clock.getTime() + TOUCH_AFTER_MS);
    expect(cookieValue(await g.get('/__t/token'))).toBe(g.session.id);
  });

  it('clears an unknown or expired cookie', async () => {
    const g = await guest(test);
    clock = new Date(clock.getTime() + SESSION_TTL_MS);
    const res = await g.get('/__t/token');
    const cleared = res.headers.getSetCookie().find((h) => h.includes('Max-Age=0'));
    expect(cleared).toBeDefined();
    expect(cookieValue(res)).not.toBe(g.session.id);
  });

  it('rotates the id on login (session fixation) and destroys it on logout', async () => {
    const g = await guest(test);
    const login = await g.postForm(`/__t/login-as/${ADMIN_EMAIL}`);
    expect(await login.text()).toBe('in');
    const rotated = cookieValue(login);
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(g.session.id);
    expect(await sessionExists(test.db, g.session.id)).toBe(false);

    const member = await loginAs(test, ADMIN_EMAIL);
    const out = await member.postForm('/__t/logout');
    expect(out.headers.getSetCookie().some((h) => h.includes('Max-Age=0'))).toBe(true);
    expect(await sessionExists(test.db, member.session.id)).toBe(false);
  });

  it('puts the CSRF token in the page head when a page asks for it', async () => {
    const g = await guest(test);
    test.app.get('/__t/page', async () => {
      const { shell } = await import('../../src/server/document.js');
      return shell({
        title: 'T',
        departments: [],
        main: '',
        clientEntry: '/e.js',
        csrfToken: g.session.csrfToken,
      });
    });
    expect(await (await g.get('/__t/page')).text()).toContain(
      `<meta name="${CSRF_META}" content="${g.session.csrfToken}"`,
    );
  });
});

describe('CSRF', () => {
  it('accepts the token from the form field and leaves the body readable', async () => {
    const g = await guest(test);
    const res = await g.postForm('/__t/echo', { note: 'hello' });
    expect(await res.text()).toBe('ok:hello');
  });

  it('accepts the token from the x-csrf-token header', async () => {
    const g = await guest(test);
    expect((await g.postJson('/api/__t/echo', {})).status).toBe(200);
  });

  it('rejects a missing or wrong token with a page, or JSON for API callers', async () => {
    const g = await guest(test);
    const page = await g.get('/__t/echo', {
      method: 'POST',
      body: new URLSearchParams({ [CSRF_FIELD]: 'wrong', note: 'x' }),
    });
    expect(page.status).toBe(403);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('Please try that again');

    const api = await g.get('/api/__t/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(api.status).toBe(403);
    expect(await api.json()).toEqual({ error: 'csrf' });
  });

  it('rejects state changes without a session at all', async () => {
    const res = await test.get('/__t/echo', {
      method: 'POST',
      headers: { [CSRF_HEADER]: 'anything' },
    });
    expect(res.status).toBe(403);
  });

  it('rejects a cross-site Origin even with the right token', async () => {
    const g = await guest(test);
    const res = await g.get('/__t/echo', {
      method: 'POST',
      headers: { origin: 'https://evil.test', [CSRF_HEADER]: g.session.csrfToken },
    });
    expect(res.status).toBe(403);
  });
});

describe('roles', () => {
  it('sends guests to login with ?next= for pages, and 401 for APIs', async () => {
    const res = await test.get('/__t/member?x=1');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/account/login?next=%2F__t%2Fmember%3Fx%3D1');
    const api = await test.get('/api/__t/member');
    expect(api.status).toBe(401);
    expect(await api.json()).toEqual({ error: 'unauthenticated' });
  });

  it('lets members in and keeps customers out of admin pages', async () => {
    const customer = await loginAs(test, await anyCustomerEmail(test));
    expect(await (await customer.get('/__t/member')).text()).toContain('hi ');
    const forbidden = await customer.get('/__t/admin');
    expect(forbidden.status).toBe(403);
    expect(await forbidden.text()).toContain('Not allowed');
    const admin = await loginAs(test, ADMIN_EMAIL);
    expect(await (await admin.get('/__t/admin')).text()).toBe('admin');
  });
});

describe('rate limiting', () => {
  it('answers 429 with Retry-After once a key is over its limit, until the window passes', async () => {
    // Each login rotates the session, so every attempt starts from a fresh guest.
    const attempt = async () => (await guest(test)).postForm('/__t/login-as/a@x.test');
    expect((await attempt()).status).toBe(200);
    clock = new Date(clock.getTime() + 1000);
    expect((await attempt()).status).toBe(200);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('59'); // the oldest attempt leaves the window in 59 s
    expect(await blocked.text()).toContain('Too many attempts');
    clock = new Date(clock.getTime() + 60_000);
    expect((await attempt()).status).toBe(200);
  });
});

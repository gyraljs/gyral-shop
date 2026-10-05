// Register, sign in, sign out (docs/product-specs/accounts.md): both the no-JS form posts and
// the JSON round trips the components make, against the real app.
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { sessions } from '../../src/db/schema/accounts.js';
import { SESSION_COOKIE } from '../../src/server/security/index.js';
import { testApp, type TestApp } from '../support/app.js';
import { anyCustomerEmail, createMember, guest, loginAs, sessionCookie } from '../support/auth.js';

const ADA = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'analytical-engine' };

async function withAda(): Promise<TestApp> {
  const test = await testApp();
  await createMember(test, ADA);
  return test;
}

const asCookie = (id: string) => ({ headers: { cookie: `${SESSION_COOKIE}=${id}` } });

describe('sign in', () => {
  it('serves a form with a CSRF token, not indexed and not cached', async () => {
    const test = await testApp();
    const res = await test.get('/account/login?next=%2Fd%2Fbooks');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(html).toContain('<meta name="robots" content="noindex"');
    expect(html).toMatch(/<shop-login[^>]*csrf-token="[^"]{20,}"/);
    expect(html).toContain('action="/account/login"');
    expect(html).toContain('href="/account/register?next=%2Fd%2Fbooks"');
  });

  it('signs in, rotates the session and returns to a safe next page', async () => {
    const test = await withAda();
    const visitor = await guest(test);
    const res = await visitor.postForm('/account/login', {
      email: 'ADA@example.com ',
      password: ADA.password,
      next: '/d/books',
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/d/books');
    const sid = sessionCookie(res);
    expect(sid).toBeDefined();
    expect(sid).not.toBe(visitor.session.id);
    const old = await test.db.select().from(sessions).where(eq(sessions.id, visitor.session.id));
    expect(old).toEqual([]);
    const account = await test.get('/account', asCookie(sid ?? ''));
    expect(await account.text()).toContain('ada@example.com');
  });

  it('ignores an off-site next target', async () => {
    const test = await withAda();
    const res = await (
      await guest(test)
    ).postForm('/account/login', {
      email: ADA.email,
      password: ADA.password,
      next: '//evil.example/steal',
    });
    expect(res.headers.get('location')).toBe('/');
  });

  it('re-renders with a form-level error for a wrong password, never echoing it', async () => {
    const test = await withAda();
    const res = await (
      await guest(test)
    ).postForm('/account/login', {
      email: ADA.email,
      password: 'not-the-password',
    });
    const html = await res.text();
    expect(res.status).toBe(422);
    expect(html).toContain('That email and password do not match an account.');
    expect(html).toContain('role="alert"');
    expect(html).toContain('value="ada@example.com"');
    expect(html).not.toContain('not-the-password');
  });

  it('re-renders schema errors on the fields', async () => {
    const test = await testApp();
    const res = await (
      await guest(test)
    ).postForm('/account/login', {
      email: 'nope',
      password: '',
    });
    const html = await res.text();
    expect(res.status).toBe(422);
    expect(html).toContain('Enter a valid email address.');
    expect(html).toContain('Enter your password.');
    expect(html).toContain('aria-invalid="true"');
  });

  it('answers the components with JSON outcomes', async () => {
    const test = await withAda();
    const ok = await (
      await guest(test)
    ).submitForm('/account/login', {
      email: ADA.email,
      password: ADA.password,
      next: '',
    });
    // Gyral formAction: a redirect becomes 200 { _tag: 'Redirected', location }, cookies kept.
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ _tag: 'Redirected', location: '/' });
    expect(sessionCookie(ok)).toBeDefined();
    const bad = await (
      await guest(test)
    ).submitForm('/account/login', {
      email: ADA.email,
      password: 'wrong-password',
    });
    // A 422 IntentRejected without values, so the password is never echoed.
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({
      _tag: 'IntentRejected',
      intent: 'Login',
      issues: [{ path: '', message: 'That email and password do not match an account.' }],
    });
  });

  it('limits attempts per account with 429 and Retry-After', async () => {
    const test = await withAda();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const res = await (
        await guest(test)
      ).postForm('/account/login', {
        email: ADA.email,
        password: `wrong-${String(attempt)}`,
      });
      statuses.push(res.status);
      if (res.status === 429) expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    }
    expect(statuses).toEqual([422, 422, 422, 422, 422, 429]);
  });

  it('sends members who are already signed in on their way', async () => {
    const test = await withAda();
    const member = await loginAs(test, ADA.email);
    const res = await member.get('/account/login?next=%2Fd%2Fbooks');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/d/books');
  });
});

describe('a first visit, without test helpers', () => {
  // Regression: page handlers return their own Response (renderPage), and Hono's setCookie()
  // never reached it, so a guest's first page had a CSRF token but no session cookie.
  it('sets the session cookie on the page that embeds its CSRF token, so the post succeeds', async () => {
    const test = await withAda();
    const page = await test.get('/account/login');
    const sid = sessionCookie(page);
    const token = /name="_csrf" value="([^"]+)"/.exec(await page.text())?.[1];
    expect(sid).toBeDefined();
    expect(token).toBeDefined();
    const res = await test.get('/account/login', {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE}=${sid ?? ''}` },
      body: new URLSearchParams({ _csrf: token ?? '', email: ADA.email, password: ADA.password }),
    });
    expect(res.status).toBe(303);
    expect(sessionCookie(res)).not.toBe(sid);
  });
});

describe('register', () => {
  it('creates the account, signs in and lands on the account page', async () => {
    const test = await testApp();
    const res = await (
      await guest(test)
    ).postForm('/account/register', {
      name: 'Grace Hopper',
      email: 'grace@example.com',
      password: 'cobol-compiler',
      confirm: 'cobol-compiler',
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/account');
    const page = await (await test.get('/account', asCookie(sessionCookie(res) ?? ''))).text();
    expect(page).toContain('grace@example.com');
    const home = await (await test.get('/', asCookie(sessionCookie(res) ?? ''))).text();
    expect(home).toContain('Hi, <!--lit-part-->Grace');
  });

  it('re-renders validation errors, keeping the name and email but never passwords', async () => {
    const test = await testApp();
    const res = await (
      await guest(test)
    ).postForm('/account/register', {
      name: 'Grace',
      email: 'grace@example.com',
      password: 'short',
      confirm: 'different',
    });
    const html = await res.text();
    expect(res.status).toBe(422);
    expect(html).toContain('Use at least 10 characters.');
    expect(html).toContain('The passwords do not match.');
    expect(html).toContain('value="Grace"');
    expect(html).not.toContain('short');
    expect(html).not.toContain('different');
  });

  it('refuses an email that already has an account', async () => {
    const test = await testApp();
    const email = await anyCustomerEmail(test);
    const res = await (
      await guest(test)
    ).postForm('/account/register', {
      name: 'Someone',
      email,
      password: 'perfectly-fine',
      confirm: 'perfectly-fine',
    });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain('An account with this email already exists.');
  });

  it('rejects common passwords', async () => {
    const test = await testApp();
    const res = await (
      await guest(test)
    ).submitForm('/account/register', {
      name: 'Grace',
      email: 'grace@example.com',
      password: 'Password123',
      confirm: 'Password123',
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { issues: { path: string; message: string }[] };
    expect(body.issues).toContainEqual({
      path: 'password',
      message: 'That password is too common. Choose another.',
    });
  });
});

describe('sign out and the account page', () => {
  it('sends guests to sign in, remembering where they were going', async () => {
    const test = await testApp();
    const res = await test.get('/account');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/account/login?next=%2Faccount');
  });

  it('shows the member a sign-out menu in the header', async () => {
    const test = await withAda();
    const member = await loginAs(test, ADA.email);
    const html = await (await member.get('/')).text();
    expect(html).toContain('<details class="account-menu">');
    expect(html).toContain('action="/account/logout"');
    expect(html).toContain(member.session.csrfToken);
  });

  it('signs out with a POST and destroys the session', async () => {
    const test = await withAda();
    const member = await loginAs(test, ADA.email);
    const res = await member.postForm('/account/logout');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/');
    expect(res.headers.get('set-cookie')).toContain(`${SESSION_COOKIE}=;`);
    expect((await member.get('/account')).status).toBe(303);
  });

  it('refuses a sign-out without the CSRF token', async () => {
    const test = await withAda();
    const member = await loginAs(test, ADA.email);
    const res = await member.get('/account/logout', { method: 'POST' });
    expect(res.status).toBe(403);
    expect((await member.get('/account')).status).toBe(200);
  });
});

describe('golden markup for the browser tests', () => {
  // The CSRF token is random per session: pin it so the fixtures are stable.
  const pinToken = (html: string): string => {
    const token = /csrf-token="([^"]+)"/.exec(html)?.[1];
    if (token === undefined) throw new Error('no csrf-token in page');
    return html.replaceAll(token, 'test-csrf-token');
  };

  it('sign-in page', async () => {
    const test = await testApp();
    const html = pinToken(await (await test.get('/account/login')).text());
    await expect(html).toMatchFileSnapshot('../fixtures/login.ssr.html');
  });

  it('sign-in page after a wrong password (seeded errors)', async () => {
    const test = await withAda();
    const res = await (
      await guest(test)
    ).postForm('/account/login', {
      email: ADA.email,
      password: 'not-the-password',
    });
    await expect(pinToken(await res.text())).toMatchFileSnapshot(
      '../fixtures/login-rejected.ssr.html',
    );
  });

  it('registration page', async () => {
    const test = await testApp();
    const html = pinToken(await (await test.get('/account/register')).text());
    await expect(html).toMatchFileSnapshot('../fixtures/register.ssr.html');
  });
});

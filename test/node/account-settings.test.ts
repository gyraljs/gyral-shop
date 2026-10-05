// Account settings (docs/product-specs/accounts.md): name, email, password and the address
// book, through both the no-JS form posts and the JSON round trips the components make.
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { addresses, sessions, users } from '../../src/db/schema/accounts.js';
import { authenticate } from '../../src/services/auth.js';
import { createSession } from '../../src/services/sessions.js';
import { testApp, type TestApp } from '../support/app.js';
import { stableHtml } from '../support/fixtures.js';
import { createMember, loginAs, sessionCookie, type TestSession } from '../support/auth.js';

const ADA = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'analytical-engine' };

async function signedIn(): Promise<{ test: TestApp; ada: TestSession; id: number }> {
  const test = await testApp();
  await createMember(test, ADA);
  const ada = await loginAs(test, ADA.email);
  const [row] = await test.db.select().from(users).where(eq(users.email, ADA.email));
  if (row === undefined) throw new Error('no Ada');
  return { test, ada, id: row.id };
}

const ADDRESS = {
  name: 'Ada Lovelace',
  line1: '12 St James Sq',
  line2: '',
  city: 'Albany',
  state: 'NY',
  postalCode: '12207',
  phone: '',
};

describe('account pages', () => {
  it('send guests to sign in and come back', async () => {
    const test = await testApp();
    for (const path of [
      '/account',
      '/account/profile',
      '/account/addresses',
      '/account/password',
    ]) {
      const res = await test.get(path);
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe(`/account/login?next=${encodeURIComponent(path)}`);
    }
  });

  it('render light-DOM forms with the account navigation, not indexed or cached', async () => {
    const { ada } = await signedIn();
    const res = await ada.get('/account/profile');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(html).toContain('<meta name="robots" content="noindex"');
    expect(html).toMatch(/<a href="\/account\/profile"[^>]*aria-current="page"/);
    // Light DOM: the form is plain markup inside the element, not a shadow-root template.
    expect(html).toMatch(/<shop-profile-form[^>]*data-gyral-light[^>]*>/);
    expect(html).not.toMatch(/<shop-profile-form[^>]*>\s*<template shadowroot/);
    expect(html).toContain('value="Ada Lovelace"');
  });
});

describe('name and email', () => {
  it('saves the name and shows a flash message once', async () => {
    const { ada, test, id } = await signedIn();
    const res = await ada.postForm('/account/profile', { name: '  Ada King ' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/account/profile');
    const flash = /flash=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
    // ada.get() sets only the session cookie; send the flash cookie alongside it.
    const page = await test.get('/account/profile', {
      headers: { cookie: `${ada.cookie}; flash=${flash}` },
    });
    expect(await page.text()).toContain('Your name is saved.');
    const again = await ada.get('/account/profile');
    expect(await again.text()).not.toContain('Your name is saved.');
    const [row] = await test.db.select().from(users).where(eq(users.id, id));
    expect(row?.name).toBe('Ada King');
  });

  it('changes the email only with the current password, rotating the session', async () => {
    const { ada, test, id } = await signedIn();
    const wrong = await ada.postForm('/account/email', {
      email: 'countess@example.com',
      current: 'not-it-at-all',
    });
    const html = await wrong.text();
    expect(wrong.status).toBe(422);
    expect(html).toContain('Your current password is not correct.');
    expect(html).not.toContain('not-it-at-all');

    const ok = await ada.postForm('/account/email', {
      email: 'Countess@Example.com',
      current: ADA.password,
    });
    expect(ok.status).toBe(303);
    expect(sessionCookie(ok)).not.toBe(ada.session.id);
    const [row] = await test.db.select().from(users).where(eq(users.id, id));
    expect(row?.email).toBe('countess@example.com');
  });

  it('refuses an email another account uses', async () => {
    const { ada, test } = await signedIn();
    await createMember(test, {
      name: 'Grace',
      email: 'grace@example.com',
      password: 'cobol-compiler',
    });
    const res = await ada.postForm('/account/email', {
      email: 'grace@example.com',
      current: ADA.password,
    });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain('Another account already uses this email.');
  });

  it('answers the JS path as JSON, without echoing the password', async () => {
    const { ada } = await signedIn();
    const res = await ada.submitForm('/account/email', {
      email: 'x@example.com',
      current: 'nope-nope-nope',
    });
    const body = (await res.json()) as {
      _tag: string;
      issues: { path: string }[];
      values?: unknown;
    };
    expect(res.status).toBe(422);
    expect(body._tag).toBe('IntentRejected');
    expect(body.issues.map((i) => i.path)).toEqual(['current']);
    expect(JSON.stringify(body)).not.toContain('nope-nope-nope');
  });
});

describe('password', () => {
  it('rejects a wrong current password and mismatched new ones', async () => {
    const { ada } = await signedIn();
    const wrong = await ada.postForm('/account/password', {
      current: 'wrong-password-1',
      password: 'a-new-long-password',
      confirm: 'a-new-long-password',
    });
    expect(wrong.status).toBe(422);
    expect(await wrong.text()).toContain('Your current password is not correct.');
    const mismatch = await ada.postForm('/account/password', {
      current: ADA.password,
      password: 'a-new-long-password',
      confirm: 'something-else-entirely',
    });
    expect(mismatch.status).toBe(422);
    expect(await mismatch.text()).toContain('The passwords do not match.');
  });

  it('changes it, signs out other devices and rotates this session', async () => {
    const { ada, test, id } = await signedIn();
    const other = await createSession(test.db, { userId: id, now: test.now() });
    const res = await ada.postForm('/account/password', {
      current: ADA.password,
      password: 'a-new-long-password',
      confirm: 'a-new-long-password',
    });
    expect(res.status).toBe(303);
    const remaining = await test.db.select().from(sessions).where(eq(sessions.userId, id));
    expect(remaining.map((s) => s.id)).toEqual([sessionCookie(res)]);
    expect(remaining.map((s) => s.id)).not.toContain(other.id);
    expect((await authenticate(test.db, ADA.email, 'a-new-long-password')).ok).toBe(true);
    expect((await authenticate(test.db, ADA.email, ADA.password)).ok).toBe(false);
  });

  it('limits current-password guesses with a form-level 429', async () => {
    const { ada } = await signedIn();
    const statuses: number[] = [];
    let last = new Response();
    for (let n = 0; n < 6; n += 1) {
      last = await ada.postForm('/account/password', {
        current: `guess-number-${String(n)}`,
        password: 'a-new-long-password',
        confirm: 'a-new-long-password',
      });
      statuses.push(last.status);
    }
    expect(statuses).toEqual([422, 422, 422, 422, 422, 429]);
    expect(Number(last.headers.get('retry-after'))).toBeGreaterThan(0);
    const html = await last.text();
    expect(html).toContain('Too many attempts. Try again in');
    expect(html).toContain('<shop-password-form'); // the form, not the generic error page
  });
});

describe('address book', () => {
  it('adds addresses: the first is the default until another is marked', async () => {
    const { ada, test, id } = await signedIn();
    expect((await ada.postForm('/account/addresses', ADDRESS)).status).toBe(303);
    expect(
      (
        await ada.postForm('/account/addresses', {
          ...ADDRESS,
          city: 'Austin',
          state: 'TX',
          postalCode: '78701',
          isDefault: 'on',
        })
      ).status,
    ).toBe(303);
    const rows = await test.db.select().from(addresses).where(eq(addresses.userId, id));
    expect(rows.map((r) => [r.city, r.isDefault])).toEqual([
      ['Albany', false],
      ['Austin', true],
    ]);
    const html = await (await ada.get('/account/addresses')).text();
    expect(html.indexOf('Austin, Texas 78701')).toBeLessThan(
      html.indexOf('Albany, New York 12207'),
    );
  });

  it('rejects invalid addresses with field errors', async () => {
    const { ada } = await signedIn();
    const res = await ada.postForm('/account/addresses', {
      ...ADDRESS,
      state: 'ZZ',
      postalCode: '12',
    });
    const html = await res.text();
    expect(res.status).toBe(422);
    expect(html).toContain('Choose a state.');
    expect(html).toContain('Enter a 5-digit ZIP code.');
  });

  it('edits, makes default and deletes, promoting another default', async () => {
    const { ada, test, id } = await signedIn();
    await ada.postForm('/account/addresses', ADDRESS);
    await ada.postForm('/account/addresses', {
      ...ADDRESS,
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
    });
    const [first, second] = await test.db.select().from(addresses).where(eq(addresses.userId, id));
    if (first === undefined || second === undefined) throw new Error('two addresses expected');

    const edit = await (await ada.get(`/account/addresses/${String(first.id)}/edit`)).text();
    expect(edit).toContain('value="12 St James Sq"');
    expect(
      (
        await ada.postForm(`/account/addresses/${String(first.id)}`, {
          ...ADDRESS,
          line1: '1 Royal Way',
        })
      ).status,
    ).toBe(303);
    expect((await ada.postForm(`/account/addresses/${String(second.id)}/default`)).status).toBe(
      303,
    );
    expect((await ada.postForm(`/account/addresses/${String(second.id)}/delete`)).status).toBe(303);
    const rows = await test.db.select().from(addresses).where(eq(addresses.userId, id));
    expect(rows.map((r) => [r.line1, r.isDefault])).toEqual([['1 Royal Way', true]]);
  });

  it("never lets one member see or change another's address", async () => {
    const { ada, test } = await signedIn();
    await createMember(test, {
      name: 'Grace',
      email: 'grace@example.com',
      password: 'cobol-compiler',
    });
    const grace = await loginAs(test, 'grace@example.com');
    await grace.postForm('/account/addresses', ADDRESS);
    const [theirs] = await test.db.select().from(addresses);
    if (theirs === undefined) throw new Error('no address');
    const path = `/account/addresses/${String(theirs.id)}`;
    expect((await ada.get(`${path}/edit`)).status).toBe(404);
    expect((await ada.postForm(path, ADDRESS)).status).toBe(404);
    expect((await ada.postForm(`${path}/delete`)).status).toBe(404);
    expect(await test.db.select().from(addresses)).toHaveLength(1);
  });

  it('rejects posts without the CSRF token', async () => {
    const { ada } = await signedIn();
    const res = await ada.get('/account/addresses', {
      method: 'POST',
      body: new URLSearchParams(ADDRESS),
    });
    expect(res.status).toBe(403);
  });
});

describe('golden markup for the browser tests', () => {
  // The CSRF token is random per session: pin it so the fixture is stable.
  const pinToken = (html: string): string => {
    const token = /csrf-token="([^"]+)"/.exec(html)?.[1];
    if (token === undefined) throw new Error('no csrf-token in page');
    return html.replaceAll(token, 'test-csrf-token');
  };

  it('address book with one address', async () => {
    const { ada } = await signedIn();
    await ada.postForm('/account/addresses', ADDRESS);
    const html = pinToken(await (await ada.get('/account/addresses')).text());
    await expect(stableHtml(html)).toMatchFileSnapshot('../fixtures/addresses.ssr.html');
  });
});

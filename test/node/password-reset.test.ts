// Forgot / reset password (docs/product-specs/accounts.md, ADR 0002): no account
// enumeration, single-use tokens that expire, other sessions ended, and the whole journey
// through the mock mail outbox.
import { describe, expect, it } from 'vitest';
import { desc, eq } from 'drizzle-orm';
import { outbox, passwordResets, sessions, users } from '../../src/db/schema.js';
import { authenticate } from '../../src/services/auth.js';
import { createSession } from '../../src/services/sessions.js';
import { testApp, type TestApp } from '../support/app.js';
import { createMember, guest, sessionCookie } from '../support/auth.js';

const ADA = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'analytical-engine' };

async function setup(clock: { now: Date } = { now: new Date('2026-10-04T12:00:00Z') }) {
  const test = await testApp({ now: () => clock.now });
  await createMember(test, ADA);
  return { test, clock };
}

/** The reset link from the newest email in the outbox. */
async function mailedLink(test: TestApp): Promise<URL | undefined> {
  const [mail] = await test.db.select().from(outbox).orderBy(desc(outbox.id)).limit(1);
  const href =
    mail === undefined
      ? undefined
      : /https?:\/\/\S+\/account\/reset\?token=\S+/.exec(mail.text)?.[0];
  return href === undefined ? undefined : new URL(href);
}

async function requestReset(test: TestApp, email: string) {
  return (await guest(test)).postForm('/account/forgot', { email });
}

describe('forgot password', () => {
  it('answers the same for known and unknown emails, mailing only real accounts', async () => {
    const { test } = await setup();
    const unknown = await requestReset(test, 'nobody@example.com');
    const known = await requestReset(test, 'ADA@example.com');
    for (const res of [unknown, known]) {
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('/account/forgot/sent');
    }
    const mails = await test.db.select().from(outbox);
    expect(mails.map((m) => m.to)).toEqual(['ada@example.com']);
    const stored = await test.db.select().from(passwordResets);
    const token = (await mailedLink(test))?.searchParams.get('token') ?? '';
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).not.toBe(token); // only a hash is stored
    expect(token.length).toBeGreaterThan(20);
  });

  it('rate-limits requests per account with a form-level 429', async () => {
    const { test } = await setup();
    const statuses: number[] = [];
    let last = new Response();
    for (let n = 0; n < 4; n += 1) {
      last = await requestReset(test, ADA.email);
      statuses.push(last.status);
    }
    expect(statuses).toEqual([303, 303, 303, 429]);
    expect(Number(last.headers.get('retry-after'))).toBeGreaterThan(0);
    const html = await last.text();
    expect(html).toContain('Too many attempts');
    expect(html).toContain('<shop-reset-request-form');
  });
});

describe('reset password', () => {
  it('resets once through the emailed link, ending other sessions and signing in', async () => {
    const { test } = await setup();
    const [ada] = await test.db.select().from(users).where(eq(users.email, ADA.email));
    if (ada === undefined) throw new Error('no Ada');
    const elsewhere = await createSession(test.db, { userId: ada.id, now: test.now() });
    await requestReset(test, ADA.email);
    const link = await mailedLink(test);
    if (link === undefined) throw new Error('no reset link mailed');

    const form = await test.get(`${link.pathname}${link.search}`);
    expect(form.status).toBe(200);
    expect(await form.text()).toContain('<shop-reset-form');

    const visitor = await guest(test);
    const token = link.searchParams.get('token') ?? '';
    const res = await visitor.postForm('/account/reset', {
      token,
      password: 'brand-new-password',
      confirm: 'brand-new-password',
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/account');
    const signedIn = sessionCookie(res);
    const remaining = await test.db.select().from(sessions).where(eq(sessions.userId, ada.id));
    expect(remaining.map((s) => s.id)).toEqual([signedIn]);
    expect(remaining.map((s) => s.id)).not.toContain(elsewhere.id);
    expect((await authenticate(test.db, ADA.email, 'brand-new-password')).ok).toBe(true);

    // Single use: the same link is dead now.
    expect((await test.get(`${link.pathname}${link.search}`)).status).toBe(410);
    // A fresh visitor: the first one's session was rotated by signing in.
    const again = await (
      await guest(test)
    ).postForm('/account/reset', {
      token,
      password: 'another-new-password',
      confirm: 'another-new-password',
    });
    expect(again.status).toBe(422);
    expect(await again.text()).toContain('This reset link has expired.');
  });

  it('expires links after 30 minutes and replaces older ones', async () => {
    const { test, clock } = await setup();
    await requestReset(test, ADA.email);
    const first = await mailedLink(test);
    await requestReset(test, ADA.email);
    const second = await mailedLink(test);
    if (first === undefined || second === undefined) throw new Error('no links');
    expect((await test.get(`${first.pathname}${first.search}`)).status).toBe(410);
    expect((await test.get(`${second.pathname}${second.search}`)).status).toBe(200);
    clock.now = new Date(clock.now.getTime() + 31 * 60_000);
    expect((await test.get(`${second.pathname}${second.search}`)).status).toBe(410);
  });

  it('rejects mismatched passwords without echoing them', async () => {
    const { test } = await setup();
    await requestReset(test, ADA.email);
    const token = (await mailedLink(test))?.searchParams.get('token') ?? '';
    const res = await (
      await guest(test)
    ).postForm('/account/reset', {
      token,
      password: 'short',
      confirm: 'different',
    });
    const html = await res.text();
    expect(res.status).toBe(422);
    expect(html).toContain('The passwords do not match.');
    // The token stays as a hidden field so the form can be resubmitted; passwords never return.
    expect(html).toContain(`value="${token}"`);
    expect(html).not.toContain('value="short"');
    expect(html).not.toContain('value="different"');
  });
});

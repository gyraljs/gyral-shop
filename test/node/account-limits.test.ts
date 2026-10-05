// Rate-limited sign-in and registration (docs/product-specs/accounts.md): the form again with
// a form-level message and status 429, never the generic error page.
import { describe, expect, it } from 'vitest';
import { testApp, type TestApp } from '../support/app.js';
import { createMember, guest } from '../support/auth.js';

const ADA = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'analytical-engine' };

async function withAda(): Promise<TestApp> {
  const test = await testApp();
  await createMember(test, ADA);
  return test;
}

describe('rate-limited account forms', () => {
  it('limits attempts per account: 429 re-renders the form with a message', async () => {
    const test = await withAda();
    const statuses: number[] = [];
    let last = new Response();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      last = await (
        await guest(test)
      ).postForm('/account/login', {
        email: ADA.email,
        password: `wrong-${String(attempt)}`,
      });
      statuses.push(last.status);
    }
    expect(statuses).toEqual([422, 422, 422, 422, 422, 429]);
    expect(Number(last.headers.get('retry-after'))).toBeGreaterThan(0);
    const html = await last.text();
    expect(html).toContain('<shop-login'); // the form, not the generic error page
    expect(html).toContain('Too many attempts. Try again in 15 minutes.');
    expect(html).toContain('value="ada@example.com"');
    expect(html).not.toContain('wrong-5');
  });

  it('answers a rate-limited JS submit with a plain 429', async () => {
    const test = await withAda();
    let last = new Response();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      last = await (
        await guest(test)
      ).submitForm('/account/login', { email: ADA.email, password: `wrong-${String(attempt)}` });
    }
    expect(last.status).toBe(429);
    expect(await last.json()).toEqual({ error: 'rate-limited' });
  });

  it('limits registrations per IP with the form re-rendered', async () => {
    const test = await testApp();
    let last = new Response();
    for (let n = 0; n < 6; n += 1) {
      last = await (
        await guest(test)
      ).postForm('/account/register', {
        name: 'X',
        email: 'not-an-email',
        password: '',
        confirm: '',
      });
    }
    expect(last.status).toBe(429);
    expect(await last.text()).toContain('<shop-register');
  });
});

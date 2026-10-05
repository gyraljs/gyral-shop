// The whole reset journey in a browser with JavaScript off, following the link the mock mail
// outbox received (docs/product-specs/mail.md).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { desc } from 'drizzle-orm';
import { outbox } from '../../src/db/schema.js';
import { testApp, type TestApp } from '../support/app.js';
import { createMember } from '../support/auth.js';
import { closeBrowser, listen, openPage, type Served } from '../support/server.js';

let served: Served;
let test: TestApp;

beforeAll(async () => {
  test = await testApp();
  await createMember(test, {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'analytical-engine',
  });
  served = await listen(test);
});

afterAll(async () => {
  await closeBrowser();
  await served.close();
});

describe('password reset without JavaScript', () => {
  it('requests a link, follows it from the outbox and signs in with the new password', async () => {
    const page = await openPage({ javaScript: false });
    await page.goto(served.url('/account/login'));
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByRole('button', { name: 'Email me a reset link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' }).isVisible()).resolves.toBe(
      true,
    );

    const [mail] = await test.db.select().from(outbox).orderBy(desc(outbox.id)).limit(1);
    const link = /https?:\/\/\S+\/account\/reset\?token=\S+/.exec(mail?.text ?? '')?.[0];
    if (link === undefined) throw new Error('no reset link in the outbox');
    const url = new URL(link);
    await page.goto(served.url(`${url.pathname}${url.search}`));
    await page.getByLabel('New password', { exact: true }).fill('brand-new-password');
    await page.getByLabel('Repeat new password').fill('brand-new-password');
    await page.getByRole('button', { name: 'Set new password' }).click();
    await page.waitForURL(/\/account$/);
    await expect(page.getByRole('status').textContent()).resolves.toContain(
      'Your password is changed. You are signed in.',
    );
  });
});

// Accounts work with JavaScript disabled (docs/product-specs/quality.md, "No-JS"): plain form
// posts, Post/Redirect/Get, server-rendered errors and the <details> account menu.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from '../support/app.js';
import { createMember } from '../support/auth.js';
import { closeBrowser, listen, openPage, type Served } from '../support/server.js';

let served: Served;

beforeAll(async () => {
  const test = await testApp();
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

describe('accounts without JavaScript', () => {
  it('registers, lands on the account page and signs out from the header menu', async () => {
    const page = await openPage({ javaScript: false });
    await page.goto(served.url('/account/register'));
    await page.getByLabel('Full name').fill('Grace Hopper');
    await page.getByLabel('Email').fill('grace@example.com');
    await page.getByLabel('Password', { exact: true }).fill('cobol-compiler');
    await page.getByLabel('Repeat password').fill('cobol-compiler');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL(/\/account$/);
    await expect(page.getByRole('heading', { name: 'Your account' }).isVisible()).resolves.toBe(
      true,
    );
    await page.getByText('Hi, Grace').click(); // <details> opens without JavaScript
    await page
      .getByRole('navigation', { name: 'Account and cart' })
      .getByRole('button', { name: 'Sign out' })
      .click();
    await page.waitForURL(served.url('/'));
    await expect(page.getByRole('link', { name: 'Sign in' }).isVisible()).resolves.toBe(true);
  });

  it('shows the server-rendered error for a wrong password, then signs in', async () => {
    const page = await openPage({ javaScript: false });
    await page.goto(served.url('/account/login?next=%2Fd%2Felectronics'));
    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert').textContent()).resolves.toContain(
      'That email and password do not match an account.',
    );
    await page.getByLabel('Password').fill('analytical-engine');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/d\/electronics$/);
    await expect(page.getByText('Hi, Ada').isVisible()).resolves.toBe(true);
  });
});

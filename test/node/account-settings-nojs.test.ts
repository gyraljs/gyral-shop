// Account settings work with JavaScript disabled (docs/product-specs/quality.md, "No-JS").
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

describe('account settings without JavaScript', () => {
  it('signs in, renames, adds, edits and deletes an address', async () => {
    const page = await openPage({ javaScript: false });
    await page.goto(served.url('/account/login?next=%2Faccount%2Fprofile'));
    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByLabel('Password').fill('analytical-engine');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/account\/profile$/);

    await page.getByLabel('Full name').fill('Ada King');
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(page.getByRole('status').textContent()).resolves.toContain('Your name is saved.');

    await page.getByRole('link', { name: 'Addresses' }).click();
    const add = page.locator('shop-address-form');
    await add.getByLabel('Full name').fill('Ada King');
    await add.getByLabel('Street address').fill('12 St James Sq');
    await add.getByLabel('City').fill('Albany');
    await add.getByLabel('State').selectOption('NY');
    await add.getByLabel('ZIP code').fill('12207');
    await add.getByRole('button', { name: 'Save address' }).click();
    await expect(page.getByRole('status').textContent()).resolves.toContain('Address saved.');
    await expect(page.getByText('Albany, New York 12207').isVisible()).resolves.toBe(true);

    await page.getByRole('link', { name: /^Edit/ }).click();
    await page.getByLabel('Street address').fill('1 Royal Way');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('1 Royal Way').isVisible()).resolves.toBe(true);

    await page.getByRole('button', { name: /^Delete/ }).click();
    await expect(page.getByText("You haven't saved an address yet.").isVisible()).resolves.toBe(
      true,
    );
  });
});

// The consent banner with JavaScript off: a plain form that saves the choice and returns.
import { count } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyticsEvents } from '../../src/db/schema.js';
import { testApp, type TestApp } from '../support/app.js';
import { closeBrowser, listen, openPage, type Served } from '../support/server.js';

let served: Served;
let test: TestApp;

beforeAll(async () => {
  test = await testApp();
  served = await listen(test);
});

afterAll(async () => {
  await closeBrowser();
  await served.close();
});

describe('consent without JavaScript', () => {
  it('rejects from the banner, stays rejected, and records nothing', async () => {
    const page = await openPage({ javaScript: false });
    await page.goto(served.url('/d/books'));
    const banner = page.getByRole('region', { name: 'Cookies on Gyral Goods' });
    await banner.getByRole('button', { name: 'Reject non-essential' }).click();
    await page.waitForURL(/\/d\/books$/);
    expect(await page.getByRole('region', { name: 'Cookies on Gyral Goods' }).count()).toBe(0);
    await page.goto(served.url('/'));
    expect(await page.getByRole('region', { name: 'Cookies on Gyral Goods' }).count()).toBe(0);
    const [row] = await test.db.select({ n: count() }).from(analyticsEvents);
    expect(row?.n).toBe(0);
  });

  it('changes the choice later from the footer link', async () => {
    const page = await openPage({ javaScript: false });
    await page.goto(served.url('/'));
    await page.getByRole('link', { name: 'Cookie settings' }).click();
    await page.getByLabel(/Analytics/).check();
    await page.getByRole('button', { name: 'Save choices' }).click();
    await page.waitForURL(/\/consent$/);
    await page.goto(served.url('/about'));
    const [row] = await test.db.select({ n: count() }).from(analyticsEvents);
    expect(row?.n).toBeGreaterThan(0);
  });
});

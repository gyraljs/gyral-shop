// Theme switching with JavaScript disabled (ADR 0006 rule 8; quality.md "No-JS"): the footer
// form posts to /theme, returns to the same page, and the next page links the chosen theme.
// Prerendered pages get the visitor's theme from /themes/current.css with no script.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { THEME_COOKIE, themeHref } from '../../src/server/theme.js';
import { DEFAULT_THEME, findTheme } from '../../src/ui/themes/registry.js';
import { testApp } from '../support/app.js';
import { noJsPage } from '../support/nojs.js';
import { closeBrowser, listen, type Served } from '../support/server.js';

let served: Served;
const defaultTheme = findTheme(DEFAULT_THEME);

beforeAll(async () => {
  served = await listen(await testApp());
});

afterAll(async () => {
  await served.close();
  await closeBrowser();
});

describe('theme switcher without JavaScript', () => {
  it('saves the choice from the footer and returns to the same page', async () => {
    if (defaultTheme === undefined) throw new Error('no default theme');
    const page = await noJsPage(served);
    await page.goto(served.url('/d/electronics'));
    const switcher = page.locator('footer [data-region="theme-switcher"]');
    await switcher.getByRole('radio', { name: defaultTheme.label }).check();
    await switcher.getByRole('button', { name: 'Apply theme' }).click();
    await page.waitForURL(served.url('/d/electronics'));
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === THEME_COOKIE)?.value).toBe(DEFAULT_THEME);
    expect(await page.locator('link#theme-css').getAttribute('href')).toBe(themeHref(defaultTheme));
    // The theme stylesheet applied (a theme token is set on the root).
    const brand = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(),
    );
    expect(brand).not.toBe('');
    await page.close();
  });

  it('styles prerendered pages from the cookie with no script', async () => {
    const page = await noJsPage(served);
    await page.goto(served.url('/about'));
    expect(await page.locator('link#theme-css').getAttribute('href')).toBe('/themes/current.css');
    const brand = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(),
    );
    expect(brand).not.toBe('');
    await page.close();
  });
});

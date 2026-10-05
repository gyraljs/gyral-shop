// Shared pieces of the no-JS journey suite (test/node/nojs-*.test.ts, quality.md "No-JS").
import type { Page } from 'playwright';
import { SESSION_COOKIE } from '../../src/server/security/index.js';
import type { TestSession } from './auth.js';
import { openPage, type Served } from './server.js';

/** A JavaScript-disabled page, optionally carrying an existing session. */
export async function noJsPage(served: Served, who?: TestSession): Promise<Page> {
  const page = await openPage({ javaScript: false });
  if (who !== undefined) {
    await page
      .context()
      .addCookies([{ name: SESSION_COOKIE, value: who.session.id, url: served.url('/') }]);
  }
  return page;
}

/** Signs in through the plain HTML form. */
export async function signInWithForm(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

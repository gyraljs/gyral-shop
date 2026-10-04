// End-to-end helpers (Node): serve the app over real HTTP and drive Chromium, e.g. with
// JavaScript disabled to prove the no-JS paths (docs/product-specs/quality.md).
import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { chromium, type Browser, type Page } from 'playwright';
import type { TestApp } from './app.js';

export interface Served {
  readonly url: (path: string) => string;
  readonly close: () => Promise<void>;
}

export async function listen(test: TestApp): Promise<Served> {
  return new Promise((resolve) => {
    const server = serve({ fetch: test.app.fetch, port: 0 }, (info: AddressInfo) => {
      resolve({
        url: (path) => `http://localhost:${String(info.port)}${path}`,
        close: () =>
          new Promise((done) => {
            server.close(() => {
              done();
            });
          }),
      });
    });
  });
}

let browser: Browser | undefined;

/** A fresh page in a shared headless Chromium. `javaScript: false` for no-JS checks. */
export async function openPage(options: { readonly javaScript: boolean }): Promise<Page> {
  browser ??= await chromium.launch();
  const context = await browser.newContext({ javaScriptEnabled: options.javaScript });
  return context.newPage();
}

export async function closeBrowser(): Promise<void> {
  await browser?.close();
  browser = undefined;
}

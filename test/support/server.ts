// End-to-end helpers (Node): serve the app over real HTTP and drive Chromium, e.g. with
// JavaScript disabled to prove the no-JS paths (docs/product-specs/quality.md).
import { createServer } from 'node:http';
import { toNodeListener, type FetchHandler } from '@gyral/ssr/node';
import { chromium, type Browser, type Page } from 'playwright';
import type { TestApp } from './app.js';

export interface Served {
  readonly url: (path: string) => string;
  readonly close: () => Promise<void>;
}

/** Serves `fetch` on a free port through Gyral's Node adapter, as `pnpm start` does. */
export async function serveFetch(fetch: FetchHandler): Promise<Served> {
  const server = createServer(toNodeListener(fetch));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('not a TCP server');
  return {
    url: (path) => `http://localhost:${String(address.port)}${path}`,
    close: () =>
      new Promise((done) => {
        server.close(() => {
          done();
        });
      }),
  };
}

export const listen = (test: TestApp): Promise<Served> => serveFetch(test.app.fetch);

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

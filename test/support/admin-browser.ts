// Mounting the client-rendered admin in browser tests: fake HTTP answers by URL, an in-memory
// router (so tests never touch the real address bar), and the document styles the shell
// would load (so axe checks real colours).
import { fakeDriver } from '@gyral/testing';
import { makeRouter } from '@gyral/router';
import { adminDrivers } from '../../src/ui/admin/drivers.js';
import { adminCss } from '../../src/ui/styles/admin.js';
import { baseCss } from '../../src/ui/styles/base.js';
import { defaultThemeCss } from '../../src/ui/themes/default.css.js';

export interface FakeRequest {
  readonly url: string;
  readonly method?: string;
  readonly body?: unknown;
}

export type Responder = (req: FakeRequest) => unknown;

const original = { ...adminDrivers };
let installed: { dispose: () => void } | undefined;

/** Installs fakes for every admin component; returns the http fake to inspect calls. */
export function fakeAdmin(initial: string, respond: Responder) {
  const http = fakeDriver<FakeRequest>('http', { impl: (req) => respond(req) });
  // Same origin as the test page, so captured links count as in-app.
  const router = makeRouter({
    history: 'memory',
    initial,
    origin: window.location.origin,
    captureLinks: true,
  });
  const location = fakeDriver<string>('location', { impl: () => undefined });
  installed = router;
  adminDrivers.http = http;
  adminDrivers.router = router;
  adminDrivers.location = location;
  if (document.getElementById('admin-test-styles') === null) {
    const style = document.createElement('style');
    style.id = 'admin-test-styles';
    style.textContent = baseCss + adminCss + defaultThemeCss;
    document.head.append(style);
  }
  return { http, router, location };
}

export function restoreAdmin(): void {
  // A memory router listens for link clicks on document: an old one would claim new clicks.
  installed?.dispose();
  installed = undefined;
  Object.assign(adminDrivers, original);
  document.body.replaceChildren();
}

/** Mounts <shop-admin> at `path` as the client would after the server shell loads. */
export async function mountAdmin(path: string): Promise<HTMLElement> {
  const { AdminApp } = await import('../../src/ui/admin/app.js');
  const el = new AdminApp();
  el.path = path;
  const main = document.createElement('main');
  main.append(el);
  document.body.append(main);
  await el.updateComplete;
  return el;
}

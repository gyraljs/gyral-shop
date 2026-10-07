// Mounting the client-rendered admin in browser tests: fake HTTP answers by URL (decoded through
// each request's schema, like production), an in-memory router (so tests never touch the real
// address bar), and the document styles the shell would load (so axe checks real colours).
// Fakes are supplied to the whole admin tree with a Gyral driver provider (withDrivers), so the
// app's own drivers (src/ui/admin/drivers.ts) stay untouched.
import { fakeDriver, withDrivers } from '@gyral/testing';
import { fakeHttp, type FakeResponse } from '@gyral/http/testing';
import { makeRouter } from '@gyral/router';
import { adminCss } from '../../src/ui/styles/admin.js';
import { baseCss } from '../../src/ui/styles/base.js';
import { defaultThemeCss } from '../../src/ui/themes/default.css.js';
import { settled } from '@gyral/core';

export interface FakeRequest {
  readonly url: string;
  readonly method?: string;
  readonly body?: unknown;
}

const REPLY = Symbol('reply');

interface Reply {
  readonly [REPLY]: true;
  readonly response: FakeResponse;
}

/** Answer with a status other than 200, e.g. `reply(409, { error: 'conflict', message })`. */
export const reply = (status: number, body?: unknown): Reply => ({
  [REPLY]: true,
  response: { status, ...(body === undefined ? {} : { body }) },
});

const isReply = (value: unknown): value is Reply =>
  typeof value === 'object' && value !== null && REPLY in value;

/** A JSON body for the request (200), or a `reply(...)` for another status. */
export type Responder = (req: FakeRequest) => unknown;

let container: HTMLElement | undefined;
let release: (() => void) | undefined;
let router: { dispose: () => void } | undefined;

/** Installs fakes for every admin component; returns the http fake to inspect requests. */
export function fakeAdmin(initial: string, respond: Responder) {
  const fake = fakeHttp({
    respond: (req) => {
      const out = respond({ url: req.url, method: req.method ?? 'GET', body: req.body });
      return isReply(out) ? out.response : { body: out };
    },
  });
  // `inputs` mirrors fakeDriver's name for the recorded requests.
  const http = Object.defineProperty(fake, 'inputs', {
    get: () => fake.requests,
  }) as typeof fake & {
    readonly inputs: readonly FakeRequest[];
  };
  // Same origin as the test page, so captured links count as in-app.
  const memory = makeRouter({
    history: 'memory',
    initial,
    origin: window.location.origin,
    captureLinks: true,
  });
  const location = fakeDriver<string>('location', { impl: () => undefined });
  router = memory;
  container = document.createElement('main');
  document.body.append(container);
  release = withDrivers(container, { http, router: memory, location });
  if (document.getElementById('admin-test-styles') === null) {
    const style = document.createElement('style');
    style.id = 'admin-test-styles';
    style.textContent = baseCss + adminCss + defaultThemeCss;
    document.head.append(style);
  }
  return { http, router: memory, location };
}

export function restoreAdmin(): void {
  router?.dispose();
  release?.();
  router = undefined;
  release = undefined;
  container = undefined;
  document.body.replaceChildren();
}

/** Mounts <shop-admin> at `path` (inside the fakes' provider), as the client would. */
export async function mountAdmin(path: string): Promise<HTMLElement> {
  const { AdminApp } = await import('../../src/ui/admin/app.js');
  const el = new AdminApp();
  el.path = path;
  const parent = container ?? document.body.appendChild(document.createElement('main'));
  parent.append(el);
  await settled();
  return el;
}

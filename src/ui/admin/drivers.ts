// Drivers shared by every admin component (docs/product-specs/admin.md: the admin is a
// client-rendered app under /admin). One router instance, so navigation from any component
// reaches the root's listen(); one http driver that adds the CSRF header to every request.
import type { AnyDriver } from '@gyral/core';
import { csrfFromMeta, makeHttpDriver } from '@gyral/http';
import { makeRouter } from '@gyral/router';
import { locationDriver } from '../drivers/location.js';
import { CSRF_META } from '../forms/csrf.js';

/** The admin app routes in-page, so it captures same-origin link clicks (Gyral ADR 0009). */
export const adminRouter = makeRouter({ captureLinks: true });

export const adminHttp = makeHttpDriver({ headers: csrfFromMeta(CSRF_META) });

/**
 * The drivers every admin component declares (`spec.drivers`). Deliberately mutable: browser
 * tests replace `http` and `router` with fakes for the whole app in one place.
 */
export const adminDrivers: Record<string, AnyDriver> = {
  http: adminHttp,
  router: adminRouter,
  location: locationDriver,
};

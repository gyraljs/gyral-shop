// Drivers shared by every admin component (docs/product-specs/admin.md: the admin is a
// client-rendered app under /admin). One router instance, so navigation from any component
// reaches the root's listen(); one http driver that adds the CSRF header to every request.
import type { DriverList } from '@gyral/core';
import { csrfFromMeta, makeHttpDriver } from '@gyral/http';
import { makeRouter } from '@gyral/router';
import { locationDriver } from '../drivers/location.js';
import { CSRF_META } from '../forms/csrf.js';

/** The admin app routes in-page, so it captures same-origin link clicks (Gyral ADR 0009). */
export const adminRouter = makeRouter({ captureLinks: true });

export const adminHttp = makeHttpDriver({ headers: csrfFromMeta(CSRF_META) });

/**
 * The drivers every admin component uses, provided once on the admin page (./app.ts), each under
 * its own name (`http`, `router`, `location`). Tests provide fakes on a nearer element
 * (provideDrivers), which wins over these.
 */
export const adminDrivers: DriverList = Object.freeze([adminHttp, adminRouter, locationDriver]);

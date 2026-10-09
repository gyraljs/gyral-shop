// The browser entry: the shell components that every page renders; page-specific components
// load on demand (./lazy.ts, shop-bha). Hydration is built into @gyral/core, so module order
// doesn't matter (Gyral view/07-hydration.md).
import '../ui/layout/site-header.js';
import '../ui/cart/mini-cart.js';
import '../ui/layout/search-box.js';
import '../ui/consent/consent.js';
import '../ui/theme/switcher.js';
import { provideDrivers } from '@gyral/core';
import { csrfHttp } from '../ui/drivers/http.js';
import { loadComponentsIn, watchForComponents } from './lazy.js';

// Writes from the storefront (checkout steps, review votes) carry the session's CSRF token: one
// http driver for the whole page (the admin app provides its own, nearer, src/ui/admin/app.ts).
provideDrivers(document.documentElement, { http: csrfHttp });

// Top-level await: importing this module finishes once the page's components are defined,
// which tests rely on (`await import(entry)` then `hydrated(page)`).
await loadComponentsIn(document);
watchForComponents(document.body);

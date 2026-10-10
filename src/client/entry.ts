// The browser entry: the shell components every page renders, and the page-wide http driver.
// Every other component loads automatically when a page renders it (Gyral's components
// loader, vite.components.ts). Hydration is built into @gyral/core, so module order doesn't
// matter (Gyral view/07-hydration.md).
import '../ui/layout/site-header.js';
import '../ui/cart/mini-cart.js';
import '../ui/layout/search-box.js';
import '../ui/consent/consent.js';
import '../ui/theme/switcher.js';
import { provideDrivers } from '@gyral/core';
import { csrfHttp } from '../ui/drivers/http.js';

// Writes from the storefront (checkout steps, review votes) carry the session's CSRF token: one
// http driver for the whole page (the admin app provides its own, nearer, src/ui/admin/app.ts).
provideDrivers(document.documentElement, { http: csrfHttp });

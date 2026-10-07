// The browser entry: the shell components that every page renders; page-specific components
// load on demand (./lazy.ts, shop-bha). Hydration is built into @gyral/core, so module order
// doesn't matter (Gyral view/07-hydration.md).
import '../ui/layout/site-header.js';
import '../ui/cart/mini-cart.js';
import '../ui/layout/search-box.js';
import '../ui/consent/consent.js';
import '../ui/theme/switcher.js';
import { loadComponentsIn, watchForComponents } from './lazy.js';

// Top-level await: importing this module finishes once the page's components are defined,
// which tests rely on (`await import(entry)` then `hydrated(page)`).
await loadComponentsIn(document);
watchForComponents(document.body);

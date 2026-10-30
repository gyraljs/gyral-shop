// Automatic components (Gyral `gyral({ components })`, ADR 0016): the plugin finds every
// `define<…>()('tag')` under src/ and each page loads exactly the components it rendered.
// `modules` (tag → module, relative to the project root) overrides or adds to that scan.
import type { Plugin } from 'vite';

/**
 * The member forms are defined through `defineMemberForm({ tag })`, which the scan can't see.
 * The settings and password-reset forms share one module, so they share one chunk.
 */
const memberForms = {
  'shop-contact-form': 'src/ui/content/contact.ts',
  'shop-review-form': 'src/ui/product/review-form.ts',
  'shop-profile-form': 'src/ui/account/settings-forms.ts',
  'shop-email-form': 'src/ui/account/settings-forms.ts',
  'shop-password-form': 'src/ui/account/settings-forms.ts',
  'shop-address-form': 'src/ui/account/settings-forms.ts',
  'shop-address-edit-form': 'src/ui/account/settings-forms.ts',
  'shop-reset-request-form': 'src/ui/account/settings-forms.ts',
  'shop-reset-form': 'src/ui/account/settings-forms.ts',
};

/**
 * The admin sections load with the admin app, which imports all ten and provides their
 * drivers. Left to the scan, each section would be its own lazily loaded chunk, splitting the
 * admin into eleven requests and costing more in total than the one admin chunk.
 */
const adminSections = {
  'shop-admin-dashboard': 'src/ui/admin/app.ts',
  'shop-admin-order': 'src/ui/admin/app.ts',
  'shop-admin-orders': 'src/ui/admin/app.ts',
  'shop-admin-product': 'src/ui/admin/app.ts',
  'shop-admin-products': 'src/ui/admin/app.ts',
  'shop-admin-promo': 'src/ui/admin/app.ts',
  'shop-admin-promos': 'src/ui/admin/app.ts',
  'shop-admin-reviews': 'src/ui/admin/app.ts',
  'shop-admin-taxonomy': 'src/ui/admin/app.ts',
  'shop-admin-users': 'src/ui/admin/app.ts',
};

export const componentModules: Readonly<Record<string, string>> = {
  ...memberForms,
  ...adminSections,
};

/**
 * Startup scan entries that Gyral 0.3.8's `optimize: 'auto'` leaves out (Gyral bead gyral-5zi;
 * drop this once 0.3.9 fixes it; ADR 0001, "Stable npm 0.3.8"): the client entry, which Vite
 * scans by default (`build.rollupOptions.input`) until 'auto' names entries of its own, and the
 * modules above, which the component scan can't see. With them, a package that only the entry
 * or a member form imports is pre-bundled at startup, not found mid-run (a page reload, and
 * "Vite unexpectedly reloaded a test" in Vitest). List it after `gyral()`: its scan is off when
 * entries are already set.
 */
export function scanEntries(): Plugin {
  return {
    name: 'shop:scan-entries',
    apply: 'serve',
    config: () => ({
      optimizeDeps: {
        entries: ['src/client/entry.ts', ...new Set(Object.values(componentModules))],
      },
    }),
  };
}

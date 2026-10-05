// Per-route code splitting (shop-bha): page-specific components load only when their tag is
// on the page. The shell (header, mini-cart, search, consent) is on every page and stays in
// the entry chunk. Server-rendered markup is already painted, so a lazily defined element
// simply hydrates a moment later: no flash.

type Loader = () => Promise<unknown>;

const listing: Loader = () => import('../ui/catalog/listing.js');
const settings: Loader = () => import('../ui/account/settings-forms.js');

/** Custom element tag → the module that defines it. */
export const LOADERS: Readonly<Record<string, Loader>> = {
  'shop-listing': listing,
  'shop-wish-toggle': () => import('../ui/wishlist/toggle.js'),
  'shop-login': () => import('../ui/account/login-form.js'),
  'shop-register': () => import('../ui/account/register-form.js'),
  'shop-buy-box': () => import('../ui/product/buy-box.js'),
  'shop-gallery': () => import('../ui/product/gallery.js'),
  'shop-reviews': () => import('../ui/product/reviews.js'),
  'shop-review-form': () => import('../ui/product/review-form.js'),
  'shop-cart-page': () => import('../ui/cart/cart-page.js'),
  'shop-checkout': () => import('../ui/checkout/checkout-page.js'),
  'shop-contact-form': () => import('../ui/content/contact.js'),
  'shop-profile-form': settings,
  'shop-email-form': settings,
  'shop-password-form': settings,
  'shop-address-form': settings,
  'shop-address-edit-form': settings,
  'shop-reset-request-form': settings,
  'shop-reset-form': settings,
  'shop-admin': () => import('../ui/admin/app.js'),
};

/** Every custom element tag under `root`, including inside (declarative) shadow roots. */
export function tagsIn(root: ParentNode): Set<string> {
  const tags = new Set<string>();
  const visit = (node: ParentNode): void => {
    for (const el of node.querySelectorAll('*')) {
      if (el.localName.includes('-')) tags.add(el.localName);
      if (el.shadowRoot !== null) visit(el.shadowRoot);
    }
  };
  visit(root);
  return tags;
}

/** Loads the modules for every lazily defined tag under `root` that isn't defined yet. */
export async function loadComponentsIn(root: ParentNode): Promise<void> {
  const pending = [...tagsIn(root)]
    .filter((tag) => customElements.get(tag) === undefined)
    .map((tag) => LOADERS[tag])
    .filter((load): load is Loader => load !== undefined);
  await Promise.all([...new Set(pending)].map((load) => load()));
}

/** Loads components for elements added later by code that didn't import their module. */
export function watchForComponents(root: Node): MutationObserver {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) void loadComponentsIn(node.parentNode ?? node);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return observer;
}

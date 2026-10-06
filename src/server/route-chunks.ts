// Route chunks (Gyral `clientAssets(manifest, entry, also)`): the modules that define a page's
// lazily loaded components (src/client/lazy.ts), by their Vite manifest key. A page lists the
// ones it renders, and production preloads them with the entry, so they download in parallel
// with it instead of after it has run. Development preloads nothing (Vite serves sources).
// test/node/route-chunks.test.ts keeps this table and lazy.ts in step.

export const ROUTE_CHUNKS = {
  listing: 'src/ui/catalog/listing.ts',
  wishToggle: 'src/ui/wishlist/toggle.ts',
  login: 'src/ui/account/login-form.ts',
  register: 'src/ui/account/register-form.ts',
  buyBox: 'src/ui/product/buy-box.ts',
  gallery: 'src/ui/product/gallery.ts',
  reviews: 'src/ui/product/reviews.ts',
  reviewForm: 'src/ui/product/review-form.ts',
  cart: 'src/ui/cart/cart-page.ts',
  checkout: 'src/ui/checkout/checkout-page.ts',
  contact: 'src/ui/content/contact.ts',
  settings: 'src/ui/account/settings-forms.ts',
  admin: 'src/ui/admin/app.ts',
} as const;

export type RouteChunk = (typeof ROUTE_CHUNKS)[keyof typeof ROUTE_CHUNKS];

/**
 * Production's `preload(modules)` from `productionServer`: the entry's preloads plus these
 * modules and their static imports.
 */
export type Preload = (modules: readonly RouteChunk[]) => readonly string[];

/**
 * `preload` with the entry itself first. Gyral writes every `modulepreload` link before the
 * entry's `<script>`, so with route chunks the entry was requested last and, over HTTP/1.1 (six
 * connections a host, as `pnpm start` serves), waited behind them: the entry evaluated
 * 655 → 946 ms after navigation on a product page (10 Mbps, 150 ms RTT, CPU 4x), and the buy
 * box was defined later than with no route preloads at all. Entry first: buy box 827 → 698 ms.
 */
export const entryFirst =
  (entry: string, preload: Preload): Preload =>
  (modules) => [entry, ...preload(modules)];

const { listing, wishToggle, buyBox, gallery, reviews } = ROUTE_CHUNKS;

/** Pages with product cards (each card has a wishlist toggle). */
export const CARD_CHUNKS: readonly RouteChunk[] = [wishToggle];
/** Category and search results: the listing and its cards. */
export const LISTING_CHUNKS: readonly RouteChunk[] = [listing, wishToggle];
/** A product page, most urgent first: the buy box above the fold, the reviews island last. */
export const PRODUCT_CHUNKS: readonly RouteChunk[] = [buyBox, gallery, wishToggle, reviews];

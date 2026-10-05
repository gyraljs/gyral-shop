// ORDER IS LOAD-BEARING: hydrate support must load before anything that imports Lit
// (Gyral ADR 0012). Then every component that may appear on a server-rendered page.
import '@gyral/ssr/hydrate';
import '../ui/layout/site-header.js';
import '../ui/catalog/listing.js';
import '../ui/account/login-form.js';
import '../ui/account/register-form.js';
import '../ui/product/buy-box.js';
import '../ui/product/gallery.js';
import '../ui/cart/mini-cart.js';
import '../ui/cart/cart-page.js';
import '../ui/checkout/checkout-page.js';

// The cart page (docs/product-specs/cart.md). Its data comes from the cart store that page()
// seeds into every page; this route adds the CSRF token for the no-JS forms and the flash
// message left by the last form post.
import { Hono } from 'hono';
import { html } from '@gyral/core';
import '../../ui/cart/cart-page.js'; // registers <shop-cart-page> for server rendering
import type { RenderPage } from '../document.js';
import { takeFlash } from '../flash.js';
import { csrfTokenFor, type AppEnv } from '../security/index.js';

export function cartPageRoutes({ render }: { readonly render: RenderPage }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.get('/cart', async (c) => {
    // The page's forms post, so it needs a (guest) session for their CSRF token.
    const csrf = await csrfTokenFor(c);
    const flash = takeFlash(c);
    return render({
      title: 'Your cart',
      noindex: true,
      csrfToken: csrf,
      main: html`<shop-cart-page data-region="cart" csrf=${csrf} .flash=${flash}></shop-cart-page>`,
    });
  });
  return routes;
}

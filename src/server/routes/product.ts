// Product detail pages (docs/product-specs/product-page.md). Mounted by app.ts.
import { Hono } from 'hono';
import type { Db } from '../../db/client.js';
import { productPage } from '../../services/product.js';
import { ADD_TO_CART_PATH } from '../../ui/product/buy-box.js';
import { productCrumbs, productPage as productView, productPath } from '../../ui/pages/product.js';
import type { RenderPage } from '../document.js';
import { csrfTokenFor, type AppEnv } from '../security/index.js';
import { breadcrumbJsonLd, productJsonLd, twitterCard } from '../seo.js';
import { publicOrigin } from '../origin.js';
import { takeFlash } from '../flash.js';
import { productReviews, reviewJsonLd } from './reviews.js';

export interface ProductRouteOptions {
  readonly db: Db;
  readonly render: RenderPage;
}

/** Meta descriptions stay under ~155 characters, cut at a word boundary. */
export const metaDescription = (text: string, max = 155): string => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).replace(/[,.;:]$/, '')}…`;
};

export function productRoutes({ db, render }: ProductRouteOptions): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/p/:slug', async (c) => {
    const data = await productPage(db, c.req.param('slug'));
    if (data === undefined) return c.notFound();
    const origin = publicOrigin(c);
    const path = productPath(data.slug);
    const canonical = new URL(path, origin).href;
    const description = metaDescription(data.description);
    const [image] = data.images;
    // The add-to-cart form needs a CSRF token, so a product page starts a (guest) session.
    const csrf = await csrfTokenFor(c);
    const reviews = await productReviews(db, data.slug, c);
    const notice = takeFlash(c);
    return render({
      title: `${data.name} — ${data.brand}`,
      description,
      canonical,
      currentDepartment: data.department.slug,
      jsonLd: [
        {
          ...productJsonLd(origin, data, path),
          ...(reviews === undefined || reviews.items.length === 0
            ? {}
            : { review: reviewJsonLd(reviews) }),
        },
        breadcrumbJsonLd(origin, productCrumbs(data), path),
      ],
      meta: [
        ['og:type', 'product'],
        ['og:title', data.name],
        ['og:description', description],
        ['og:url', canonical],
        ...(image === undefined
          ? []
          : ([
              ['og:image', new URL(image.url, origin).href],
              ['og:image:alt', image.alt],
            ] as const)),
      ],
      metaNames: twitterCard(image?.url),
      main: productView(data, {
        csrf,
        action: ADD_TO_CART_PATH,
        ...(reviews === undefined ? {} : { reviews }),
        ...(notice === undefined ? {} : { notice }),
      }),
    });
  });

  return routes;
}

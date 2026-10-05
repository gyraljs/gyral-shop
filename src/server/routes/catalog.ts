// Department and category pages (docs/product-specs/catalog.md). Mounted by app.ts.
import { Hono } from 'hono';
import type { Db } from '../../db/client.js';
import { parseListing } from '../../domain/listing.js';
import { categoryPage, departmentPage } from '../../services/departments.js';
import { listingTitle, resultSummary } from '../../ui/catalog/listing-view.js';
import {
  categoryCrumbs,
  categoryListing,
  categoryPage as categoryView,
  categoryPath,
} from '../../ui/pages/category.js';
import { departmentCrumbs, departmentPage as departmentView } from '../../ui/pages/department.js';
import type { RenderPage } from '../document.js';
import { breadcrumbJsonLd } from '../seo.js';
import { publicOrigin } from '../origin.js';

export interface CatalogRouteOptions {
  readonly db: Db;
  readonly render: RenderPage;
}

export function catalogRoutes({ db, render }: CatalogRouteOptions): Hono {
  const routes = new Hono();

  routes.get('/d/:department', async (c) => {
    const data = await departmentPage(db, c.req.param('department'));
    if (data === undefined) return c.notFound();
    const origin = publicOrigin(c);
    const path = `/d/${data.department.slug}`;
    return render({
      title: data.department.name,
      description:
        data.department.description === ''
          ? `Shop ${data.department.name} at Gyral Goods.`
          : data.department.description,
      canonical: new URL(path, origin).href,
      jsonLd: [breadcrumbJsonLd(origin, departmentCrumbs(data), path)],
      currentDepartment: data.department.slug,
      main: departmentView(data),
    });
  });

  routes.get('/c/:department/:category', async (c) => {
    const department = c.req.param('department');
    const category = c.req.param('category');
    const listing = parseListing(new URL(c.req.url).searchParams);
    if (!listing.ok) {
      // One URL per listing state: `?page=1`, empty form fields and junk redirect to the
      // canonical spelling (a no-JS filter form submission lands here once).
      return c.redirect(categoryPath(department, category, listing.error.state), 301);
    }
    const result = await categoryPage(db, department, category, listing.value);
    if (result._tag !== 'Found') return c.notFound(); // unknown slug or page past the end
    const { data } = result;
    const view = categoryListing(data);
    const origin = publicOrigin(c);
    // Pages of the plain listing are their own canonical URLs (Google's guidance). Sorted or
    // filtered states point to the plain listing and stay out of the index (SEO spec).
    const base = categoryPath(data.department.slug, data.category.slug);
    const path = data.refined
      ? base
      : categoryPath(data.department.slug, data.category.slug, data.page);
    return render({
      title: listingTitle(view),
      description: `Shop ${data.category.name.toLowerCase()} in ${data.department.name} at Gyral Goods. ${resultSummary(view)}.`,
      canonical: new URL(path, origin).href,
      noindex: data.refined,
      jsonLd: [breadcrumbJsonLd(origin, categoryCrumbs(data), base)],
      currentDepartment: data.department.slug,
      main: categoryView(data),
    });
  });

  // The same listing as JSON, for <shop-listing> updates without a reload. Lenient: a
  // non-canonical query is answered for its canonical state instead of redirected.
  routes.get('/api/listing/c/:department/:category', async (c) => {
    const parsed = parseListing(new URL(c.req.url).searchParams);
    const state = parsed.ok ? parsed.value : parsed.error.state;
    const result = await categoryPage(
      db,
      c.req.param('department'),
      c.req.param('category'),
      state,
    );
    if (result._tag !== 'Found') return c.json({ error: 'not_found' }, 404);
    c.header('cache-control', 'no-store');
    return c.json(categoryListing(result.data));
  });

  return routes;
}

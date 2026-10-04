// Department and category pages (docs/product-specs/catalog.md). Mounted by app.ts.
import { Hono } from 'hono';
import type { Db } from '../../db/client.js';
import { parseListing } from '../../domain/listing.js';
import { categoryPage, departmentPage } from '../../services/departments.js';
import {
  categoryCrumbs,
  categoryPage as categoryView,
  categoryPath,
} from '../../ui/pages/category.js';
import { departmentCrumbs, departmentPage as departmentView } from '../../ui/pages/department.js';
import type { RenderPage } from '../document.js';
import { breadcrumbJsonLd } from '../seo.js';

export interface CatalogRouteOptions {
  readonly db: Db;
  readonly render: RenderPage;
}

export function catalogRoutes({ db, render }: CatalogRouteOptions): Hono {
  const routes = new Hono();

  routes.get('/d/:department', async (c) => {
    const data = await departmentPage(db, c.req.param('department'));
    if (data === undefined) return c.notFound();
    const { origin } = new URL(c.req.url);
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
    const listing = parseListing(c.req.query());
    if (!listing.ok) {
      // One URL per listing page: `?page=1` and junk redirect to the canonical spelling.
      return c.redirect(categoryPath(department, category, listing.error.state.page), 301);
    }
    const result = await categoryPage(db, department, category, listing.value);
    if (result._tag !== 'Found') return c.notFound(); // unknown slug or page past the end
    const { data } = result;
    const { origin } = new URL(c.req.url);
    // Each page of a paginated listing is its own canonical URL (Google's guidance).
    const path = categoryPath(data.department.slug, data.category.slug, data.page);
    const pageSuffix = data.page > 1 ? ` (page ${String(data.page)})` : '';
    return render({
      title: `${data.category.name} — ${data.department.name}${pageSuffix}`,
      description: `Shop ${String(data.total)} ${data.category.name.toLowerCase()} products in ${data.department.name} at Gyral Goods.`,
      canonical: new URL(path, origin).href,
      jsonLd: [breadcrumbJsonLd(origin, categoryCrumbs(data), path)],
      currentDepartment: data.department.slug,
      main: categoryView(data),
    });
  });

  return routes;
}

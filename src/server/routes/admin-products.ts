// Admin products and inventory API (docs/product-specs/admin.md). Admins only. Saves are Gyral
// formActions over the same schemas the browser validates with; the admin answers JSON:
// `{ _tag: 'Saved', id }`, `{ _tag: 'Adjusted', stock }`, or 422 with an IntentRejected.
import { Hono, type Context } from 'hono';
import { formAction, rejectWith, type FormReject } from '@gyral/ssr';
import type { IntentRejected } from '@gyral/core';
import * as v from 'valibot';
import { parseDollars, parseImages, parseOptions, PRODUCT_SORTS } from '../../domain/admin.js';
import type { Result } from '../../domain/result.js';
import type { ProductFields } from '../../db/repos/admin-products.js';
import type { TaxonKind } from '../../db/repos/admin-taxonomy.js';
import type { Services } from '../../services/container.js';
import {
  adjustInventory,
  archiveProduct,
  editableProduct,
  listProducts,
  productTaxonomy,
  renameTaxonomy,
  saveProduct,
  saveVariant,
  type AdminError,
} from '../../services/admin-products.js';
import {
  AdjustForm,
  ArchiveForm,
  ProductForm,
  RenameForm,
  VariantForm,
} from '../../ui/admin/schemas.js';
import { requireAdmin, type AppEnv } from '../security/index.js';
import { NO_STORE } from './admin-http.js';

type C = Context<AppEnv>;

const ListQuery = v.object({
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ''),
  sort: v.optional(v.picklist(PRODUCT_SORTS), 'name'),
  dir: v.optional(v.picklist(['asc', 'desc']), 'asc'),
  archived: v.optional(v.picklist(['yes', 'no']), 'no'),
  page: v.optional(v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)), '1'),
});

/** An admin service failure as an HTTP answer. */
export function adminFailure(c: C, error: AdminError): Response {
  switch (error._tag) {
    case 'Unauthenticated':
      return c.json({ error: 'unauthenticated' }, 401, NO_STORE);
    case 'Forbidden':
      return c.json({ error: 'forbidden' }, 403, NO_STORE);
    case 'NotFound':
      return c.json({ error: 'not-found' }, 404, NO_STORE);
    case 'Invalid':
      return c.json({ error: 'invalid', issues: error.issues }, 422, NO_STORE);
  }
}

/** A service result for a formAction: success JSON, a field rejection, or an error answer. */
function answer<T>(
  c: C,
  result: Result<T, AdminError>,
  body: (value: T) => object,
): Response | FormReject {
  if (result.ok) return c.json(body(result.value), 200, NO_STORE);
  return result.error._tag === 'Invalid'
    ? rejectWith(result.error.issues)
    : adminFailure(c, result.error);
}

/** The admin requires JavaScript, so a rejected submission is always answered as JSON. */
const asJson = (rejected: IntentRejected) =>
  Response.json(
    { _tag: rejected._tag, intent: rejected.intent, issues: rejected.issues },
    { status: 422, headers: NO_STORE },
  );

const positiveId = (text: string): number | undefined => {
  const n = Number(text);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
};

type ProductData = v.InferOutput<(typeof ProductForm)['schema']>;

const productFields = (data: ProductData): ProductFields => ({
  slug: data.slug,
  name: data.name,
  description: data.description,
  departmentId: data.departmentId,
  categoryId: data.categoryId,
  brandId: data.brandId,
  priceCents: parseDollars(data.price) ?? 0,
  salePriceCents: data.salePrice === '' ? null : (parseDollars(data.salePrice) ?? null),
  images: parseImages(data.images, data.name) ?? [],
});

const variantFields = (data: v.InferOutput<(typeof VariantForm)['schema']>) => ({
  sku: data.sku,
  options: parseOptions(data.options) ?? {},
  priceCents: data.price === '' ? null : (parseDollars(data.price) ?? null),
});

const TAXON_KINDS: readonly TaxonKind[] = ['department', 'category', 'brand'];

export function adminProductRoutes(services: Services): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const { db } = services;
  routes.use('/api/admin/*', requireAdmin());
  const notFound = (c: C) => adminFailure(c, { _tag: 'NotFound' });

  routes.get('/api/admin/products', async (c) => {
    const parsed = v.safeParse(ListQuery, c.req.query());
    const q = parsed.success ? parsed.output : v.parse(ListQuery, {});
    const result = await listProducts(db, c.get('user'), {
      q: q.q,
      sort: q.sort,
      dir: q.dir,
      archived: q.archived === 'yes',
      page: q.page,
    });
    return result.ok ? c.json(result.value, 200, NO_STORE) : adminFailure(c, result.error);
  });

  routes.get('/api/admin/taxonomy', async (c) => {
    const result = await productTaxonomy(db, c.get('user'));
    return result.ok ? c.json(result.value, 200, NO_STORE) : adminFailure(c, result.error);
  });

  routes.get('/api/admin/products/:id', async (c) => {
    const id = positiveId(c.req.param('id'));
    if (id === undefined) return notFound(c);
    const result = await editableProduct(db, c.get('user'), id);
    return result.ok ? c.json(result.value, 200, NO_STORE) : adminFailure(c, result.error);
  });

  const saveProductAt = (c: C, id: number | undefined) =>
    formAction(ProductForm, {
      intent: 'SaveProduct',
      valid: async (data) =>
        answer(
          c,
          await saveProduct(db, c.get('user'), id, productFields(data), services.now()),
          (r) => ({
            _tag: 'Saved',
            id: r.id,
          }),
        ),
      invalid: asJson,
    })(c.req.raw);

  routes.post('/api/admin/products', (c) => saveProductAt(c, undefined));
  routes.post('/api/admin/products/:id', (c) => {
    const id = positiveId(c.req.param('id'));
    return id === undefined ? notFound(c) : saveProductAt(c, id);
  });

  routes.post('/api/admin/products/:id/archive', (c) => {
    const id = positiveId(c.req.param('id'));
    if (id === undefined) return notFound(c);
    return formAction(ArchiveForm, {
      intent: 'Archive',
      valid: async (data) =>
        answer(c, await archiveProduct(db, c.get('user'), id, data.archived === 'yes'), (r) => ({
          _tag: 'Saved',
          id: r.id,
        })),
      invalid: asJson,
    })(c.req.raw);
  });

  routes.post('/api/admin/products/:id/variants', (c) => {
    const productId = positiveId(c.req.param('id'));
    if (productId === undefined) return notFound(c);
    return formAction(VariantForm, {
      intent: 'AddVariant',
      valid: async (data) =>
        answer(
          c,
          await saveVariant(db, c.get('user'), { productId }, variantFields(data)),
          (r) => ({
            _tag: 'Saved',
            id: r.id,
          }),
        ),
      invalid: asJson,
    })(c.req.raw);
  });

  routes.post('/api/admin/variants/:id', (c) => {
    const variantId = positiveId(c.req.param('id'));
    if (variantId === undefined) return notFound(c);
    return formAction(VariantForm, {
      intent: 'SaveVariant',
      valid: async (data) =>
        answer(
          c,
          await saveVariant(db, c.get('user'), { variantId }, variantFields(data)),
          (r) => ({
            _tag: 'Saved',
            id: r.id,
          }),
        ),
      invalid: asJson,
    })(c.req.raw);
  });

  routes.post('/api/admin/variants/:id/adjust', (c) => {
    const variantId = positiveId(c.req.param('id'));
    if (variantId === undefined) return notFound(c);
    return formAction(AdjustForm, {
      intent: 'Adjust',
      valid: async (data) =>
        answer(
          c,
          await adjustInventory(db, c.get('user'), { variantId, ...data }, services.now()),
          (r) => ({ _tag: 'Adjusted', stock: r.stock }),
        ),
      invalid: asJson,
    })(c.req.raw);
  });

  routes.post('/api/admin/taxonomy/:kind/:id', (c) => {
    const kind = TAXON_KINDS.find((k) => k === c.req.param('kind'));
    const id = positiveId(c.req.param('id'));
    if (kind === undefined || id === undefined) return notFound(c);
    return formAction(RenameForm, {
      intent: 'Rename',
      valid: async (data) =>
        answer(c, await renameTaxonomy(db, c.get('user'), kind, id, data.name), (r) => ({
          _tag: 'Saved',
          id: r.id,
        })),
      invalid: asJson,
    })(c.req.raw);
  });

  return routes;
}

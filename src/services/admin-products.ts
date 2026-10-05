// Admin products and inventory (docs/product-specs/admin.md). Admins only (checked here and
// by the route guard). Every write goes through writeTransaction; stock changes only through
// adjustInventory, which is logged and never takes stock below zero.
import {
  adjustStock,
  adminProductRows,
  countAdminProducts,
  insertProduct,
  insertVariant,
  productForEdit,
  setArchived,
  skuTaken,
  slugTaken,
  taxonomy,
  updateProduct,
  updateVariant,
  variantProduct,
  type ProductFields,
  type ProductListQuery,
  type VariantFields,
} from '../db/repos/admin-products.js';
import { renameTaxon, type TaxonKind } from '../db/repos/admin-taxonomy.js';
import type { Db } from '../db/client.js';
import { writeTransaction } from '../db/tx.js';
import {
  PRODUCTS_PER_PAGE,
  type ProductEdit,
  type ProductList,
  type Taxonomy,
} from '../domain/admin.js';
import { err, ok, type Result } from '../domain/result.js';
import { requireRole, type Actor, type AuthzError } from './authz.js';

export interface FieldProblem {
  readonly path: string;
  readonly message: string;
}

export type AdminError =
  | AuthzError
  | { readonly _tag: 'NotFound' }
  | { readonly _tag: 'Invalid'; readonly issues: readonly FieldProblem[] };

const invalid = (path: string, message: string): Result<never, AdminError> =>
  err({ _tag: 'Invalid', issues: [{ path, message }] });

function admin(actor: Actor): Result<{ readonly id: number }, AdminError> {
  const allowed = requireRole(actor, 'admin');
  return allowed.ok ? ok(allowed.value) : err(allowed.error);
}

export async function listProducts(
  db: Db,
  actor: Actor,
  query: Omit<ProductListQuery, 'limit' | 'offset'> & { readonly page: number },
): Promise<Result<ProductList, AdminError>> {
  const allowed = admin(actor);
  if (!allowed.ok) return allowed;
  const total = await countAdminProducts(db, query);
  const pages = Math.max(1, Math.ceil(total / PRODUCTS_PER_PAGE));
  if (query.page > pages) return err({ _tag: 'NotFound' });
  const rows = await adminProductRows(db, {
    ...query,
    limit: PRODUCTS_PER_PAGE,
    offset: (query.page - 1) * PRODUCTS_PER_PAGE,
  });
  return ok({ rows, page: query.page, pages, total });
}

export async function productTaxonomy(db: Db, actor: Actor): Promise<Result<Taxonomy, AdminError>> {
  const allowed = admin(actor);
  return allowed.ok ? ok(await taxonomy(db)) : allowed;
}

export async function editableProduct(
  db: Db,
  actor: Actor,
  id: number,
): Promise<Result<ProductEdit, AdminError>> {
  const allowed = admin(actor);
  if (!allowed.ok) return allowed;
  const [found, tax] = await Promise.all([productForEdit(db, id), taxonomy(db)]);
  if (found === undefined) return err({ _tag: 'NotFound' });
  return ok({
    ...found,
    log: found.log.map((entry) => ({ ...entry, at: entry.at.toISOString() })),
    taxonomy: tax,
  });
}

/** The category must exist, belong to the department, and the brand must exist. */
async function taxonomyProblem(db: Db, fields: ProductFields): Promise<FieldProblem | undefined> {
  const tax = await taxonomy(db);
  if (!tax.departments.some((d) => d.id === fields.departmentId)) {
    return { path: 'departmentId', message: 'Choose a department.' };
  }
  const category = tax.categories.find((c) => c.id === fields.categoryId);
  if (category === undefined || category.departmentId !== fields.departmentId) {
    return { path: 'categoryId', message: 'Choose a category in the chosen department.' };
  }
  if (!tax.brands.some((b) => b.id === fields.brandId)) {
    return { path: 'brandId', message: 'Choose a brand.' };
  }
  return undefined;
}

/** Creates (`id` undefined) or updates a product. */
export async function saveProduct(
  db: Db,
  actor: Actor,
  id: number | undefined,
  fields: ProductFields,
  now: Date,
): Promise<Result<{ readonly id: number }, AdminError>> {
  const allowed = admin(actor);
  if (!allowed.ok) return allowed;
  const problem = await taxonomyProblem(db, fields);
  if (problem !== undefined) return invalid(problem.path, problem.message);
  if (await slugTaken(db, fields.slug, id)) {
    return invalid('slug', 'Another product already uses this slug.');
  }
  if (id === undefined) {
    return ok({ id: await writeTransaction(db, (tx) => insertProduct(tx, fields, now)) });
  }
  const updated = await writeTransaction(db, (tx) => updateProduct(tx, id, fields));
  return updated ? ok({ id }) : err({ _tag: 'NotFound' });
}

export async function archiveProduct(
  db: Db,
  actor: Actor,
  id: number,
  archived: boolean,
): Promise<Result<{ readonly id: number }, AdminError>> {
  const allowed = admin(actor);
  if (!allowed.ok) return allowed;
  const done = await writeTransaction(db, (tx) => setArchived(tx, id, archived));
  return done ? ok({ id }) : err({ _tag: 'NotFound' });
}

/** Adds a variant to `target.productId`, or updates `target.variantId`. */
export async function saveVariant(
  db: Db,
  actor: Actor,
  target: { readonly productId: number } | { readonly variantId: number },
  fields: VariantFields,
): Promise<Result<{ readonly id: number }, AdminError>> {
  const allowed = admin(actor);
  if (!allowed.ok) return allowed;
  const except = 'variantId' in target ? target.variantId : undefined;
  if (await skuTaken(db, fields.sku, except)) {
    return invalid('sku', 'Another variant already uses this SKU.');
  }
  if ('productId' in target) {
    if ((await productForEdit(db, target.productId)) === undefined)
      return err({ _tag: 'NotFound' });
    await writeTransaction(db, (tx) => insertVariant(tx, target.productId, fields));
    return ok({ id: target.productId });
  }
  const productId = await writeTransaction(db, (tx) => updateVariant(tx, target.variantId, fields));
  return productId === undefined ? err({ _tag: 'NotFound' }) : ok({ id: productId });
}

/** Adds or removes units with a reason (inventory_log); refuses to go below zero. */
export async function adjustInventory(
  db: Db,
  actor: Actor,
  input: { readonly variantId: number; readonly delta: number; readonly reason: string },
  now: Date,
): Promise<Result<{ readonly stock: number }, AdminError>> {
  const allowed = admin(actor);
  if (!allowed.ok) return allowed;
  if ((await variantProduct(db, input.variantId)) === undefined) return err({ _tag: 'NotFound' });
  const stock = await writeTransaction(db, (tx) =>
    adjustStock(tx, { ...input, actorId: allowed.value.id, now }),
  );
  return stock === undefined
    ? invalid('delta', 'That would take stock below zero.')
    : ok({ stock });
}

/** Renames a department, category or brand; search results follow (shop-eyl). */
export async function renameTaxonomy(
  db: Db,
  actor: Actor,
  kind: TaxonKind,
  id: number,
  name: string,
): Promise<Result<{ readonly id: number }, AdminError>> {
  const allowed = admin(actor);
  if (!allowed.ok) return allowed;
  const done = await writeTransaction(db, (tx) => renameTaxon(tx, kind, id, name));
  return done ? ok({ id }) : err({ _tag: 'NotFound' });
}

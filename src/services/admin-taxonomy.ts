// Departments, categories and brands (docs/product-specs/admin.md). Admins only. Archiving hides
// one from shoppers and is refused while live products use it, so no live product ever sits in
// a hidden department or category. Renames live in admin-products.ts (renameTaxonomy).
import {
  categoryDepartment,
  findTaxon,
  insertTaxon,
  liveProductCount,
  setTaxonArchived,
  slugInUse,
  taxonomyTree,
  type TaxonKind,
} from '../db/repos/admin-taxonomy.js';
import type { Db } from '../db/client.js';
import { writeTransaction } from '../db/tx.js';
import { slugify, type TaxonomyAdmin } from '../domain/admin-manage.js';
import { err, ok, type Result } from '../domain/result.js';
import type { AdminError } from './admin-products.js';
import { requireRole, type Actor } from './authz.js';

const invalid = (path: string, message: string): Result<never, AdminError> =>
  err({ _tag: 'Invalid', issues: [{ path, message }] });

function admin(actor: Actor): Result<true, AdminError> {
  const allowed = requireRole(actor, 'admin');
  return allowed.ok ? ok(true) : err(allowed.error);
}

const NOUN: Readonly<Record<TaxonKind, string>> = {
  department: 'department',
  category: 'category',
  brand: 'brand',
};

export async function adminTaxonomy(
  db: Db,
  actor: Actor,
): Promise<Result<TaxonomyAdmin, AdminError>> {
  const allowed = admin(actor);
  if (!allowed.ok) return allowed;
  const tree = await taxonomyTree(db);
  return ok({
    departments: tree.departments.map((d) => ({
      ...d,
      categories: tree.categories
        .filter((c) => c.departmentId === d.id)
        .map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          archived: c.archived,
          products: c.products,
        })),
    })),
    brands: tree.brands,
  });
}

export interface TaxonInput {
  readonly kind: TaxonKind;
  readonly name: string;
  /** Empty: derived from the name. */
  readonly slug: string;
  readonly departmentId: string;
}

export async function createTaxon(
  db: Db,
  actor: Actor,
  input: TaxonInput,
): Promise<Result<{ readonly id: number }, AdminError>> {
  const allowed = admin(actor);
  if (!allowed.ok) return allowed;
  const slug = input.slug === '' ? slugify(input.name) : input.slug;
  if (slug === '') return invalid('slug', 'Enter a slug: the name has no letters or digits.');
  const departmentId = input.kind === 'category' ? Number(input.departmentId) : undefined;
  return writeTransaction(db, async (tx) => {
    if (departmentId !== undefined) {
      const department = await findTaxon(tx, 'department', departmentId);
      if (department === undefined) return invalid('departmentId', 'Choose a department.');
      if (department.archived) {
        return invalid('departmentId', 'Restore that department before adding categories to it.');
      }
    }
    if (await slugInUse(tx, input.kind, slug, departmentId)) {
      return invalid('slug', `Another ${NOUN[input.kind]} already uses the slug “${slug}”.`);
    }
    const id = await insertTaxon(tx, input.kind, {
      name: input.name,
      slug,
      ...(departmentId === undefined ? {} : { departmentId }),
    });
    return ok({ id });
  });
}

export async function archiveTaxon(
  db: Db,
  actor: Actor,
  kind: TaxonKind,
  id: number,
  archived: boolean,
): Promise<Result<{ readonly id: number }, AdminError>> {
  const allowed = admin(actor);
  if (!allowed.ok) return allowed;
  return writeTransaction(db, async (tx) => {
    const found = await findTaxon(tx, kind, id);
    if (found === undefined) return err({ _tag: 'NotFound' } as const);
    if (!archived && kind === 'category' && (await categoryDepartment(tx, id))?.archived === true) {
      return invalid('', 'Restore its department first.');
    }
    if (await setTaxonArchived(tx, kind, id, archived)) return ok({ id });
    const live = await liveProductCount(tx, kind, id);
    return invalid(
      '',
      `Archive or move its ${String(live)} live ${live === 1 ? 'product' : 'products'} first.`,
    );
  });
}

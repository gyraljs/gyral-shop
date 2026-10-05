// Admin product and inventory queries (docs/product-specs/admin.md). Writes take a transaction
// handle from writeTransaction (src/db/tx.ts). Stock changes only through adjustStock, which
// logs every change and never lets stock go below zero.
import { and, asc, count, desc, eq, inArray, or, sql, sum, type SQL } from 'drizzle-orm';
import type { Db } from '../client.js';
import {
  brands,
  categories,
  departments,
  inventoryLog,
  productImages,
  products,
  variants,
} from '../schema.js';
import type { Tx } from '../tx.js';

type Reader = Db | Tx;

export interface ProductListQuery {
  readonly q: string;
  readonly sort: 'name' | 'price' | 'stock' | 'newest';
  readonly dir: 'asc' | 'desc';
  readonly archived: boolean;
  readonly limit: number;
  readonly offset: number;
}

/** `%`, `_` and `\` match literally in LIKE patterns (ESCAPE '\'). */
const likeText = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function listWhere(query: Pick<ProductListQuery, 'q' | 'archived'>): SQL | undefined {
  const archived = eq(products.archived, query.archived);
  if (query.q === '') return archived;
  const pattern = likeText(query.q);
  const skuMatch = sql`exists (select 1 from ${variants} where ${variants.productId} = ${products.id} and ${variants.sku} like ${pattern} escape '\\')`;
  return and(
    archived,
    or(
      sql`${products.name} like ${pattern} escape '\\'`,
      sql`${products.slug} like ${pattern} escape '\\'`,
      skuMatch,
    ),
  );
}

const stockSum = sql<number>`coalesce(sum(${variants.stock}), 0)`.mapWith(Number);

export async function countAdminProducts(
  db: Reader,
  query: Pick<ProductListQuery, 'q' | 'archived'>,
): Promise<number> {
  const [row] = await db.select({ n: count() }).from(products).where(listWhere(query));
  return row?.n ?? 0;
}

export function adminProductRows(db: Reader, query: ProductListQuery) {
  const by = {
    name: products.name,
    price: sql`coalesce(${products.salePriceCents}, ${products.priceCents})`,
    stock: stockSum,
    newest: products.createdAt,
  }[query.sort];
  const order = query.dir === 'asc' ? asc(by) : desc(by);
  return db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      brand: brands.name,
      department: departments.name,
      category: categories.name,
      priceCents: products.priceCents,
      salePriceCents: products.salePriceCents,
      stock: stockSum,
      variants: count(variants.id),
      archived: products.archived,
    })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(departments, eq(departments.id, products.departmentId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(variants, eq(variants.productId, products.id))
    .where(listWhere(query))
    .groupBy(products.id)
    .orderBy(order, asc(products.id))
    .limit(query.limit)
    .offset(query.offset);
}

export async function taxonomy(db: Reader) {
  const [deps, cats, brandRows] = await Promise.all([
    db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(eq(departments.archived, false))
      .orderBy(asc(departments.position), asc(departments.name)),
    db
      .select({ id: categories.id, departmentId: categories.departmentId, name: categories.name })
      .from(categories)
      .where(eq(categories.archived, false))
      .orderBy(asc(categories.departmentId), asc(categories.position), asc(categories.name)),
    db
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(eq(brands.archived, false))
      .orderBy(asc(brands.name)),
  ]);
  return { departments: deps, categories: cats, brands: brandRows };
}

export async function productForEdit(db: Reader, id: number) {
  const [product] = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      description: products.description,
      departmentId: products.departmentId,
      categoryId: products.categoryId,
      brandId: products.brandId,
      priceCents: products.priceCents,
      salePriceCents: products.salePriceCents,
      archived: products.archived,
    })
    .from(products)
    .where(eq(products.id, id));
  if (product === undefined) return undefined;
  const [images, variantRows] = await Promise.all([
    db
      .select({ url: productImages.url, alt: productImages.alt })
      .from(productImages)
      .where(eq(productImages.productId, id))
      .orderBy(asc(productImages.position), asc(productImages.id)),
    db
      .select({
        id: variants.id,
        sku: variants.sku,
        options: variants.options,
        priceCents: variants.priceCents,
        stock: variants.stock,
      })
      .from(variants)
      .where(eq(variants.productId, id))
      .orderBy(asc(variants.position), asc(variants.id)),
  ]);
  const log =
    variantRows.length === 0
      ? []
      : await db
          .select({
            sku: variants.sku,
            delta: inventoryLog.delta,
            reason: inventoryLog.reason,
            at: inventoryLog.createdAt,
          })
          .from(inventoryLog)
          .innerJoin(variants, eq(variants.id, inventoryLog.variantId))
          .where(
            inArray(
              inventoryLog.variantId,
              variantRows.map((row) => row.id),
            ),
          )
          .orderBy(desc(inventoryLog.createdAt), desc(inventoryLog.id))
          .limit(20);
  return { product, images, variants: variantRows, log };
}

export interface ProductFields {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly departmentId: number;
  readonly categoryId: number;
  readonly brandId: number;
  readonly priceCents: number;
  readonly salePriceCents: number | null;
  readonly images: readonly { readonly url: string; readonly alt: string }[];
}

/** The products-table columns of the fields (images live in their own table). */
const productColumns = (f: ProductFields) => ({
  slug: f.slug,
  name: f.name,
  description: f.description,
  departmentId: f.departmentId,
  categoryId: f.categoryId,
  brandId: f.brandId,
  priceCents: f.priceCents,
  salePriceCents: f.salePriceCents,
});

async function replaceImages(tx: Tx, productId: number, fields: ProductFields): Promise<void> {
  await tx.delete(productImages).where(eq(productImages.productId, productId));
  if (fields.images.length > 0) {
    await tx
      .insert(productImages)
      .values(fields.images.map((image, position) => ({ productId, ...image, position })));
  }
}

export async function insertProduct(tx: Tx, fields: ProductFields, now: Date): Promise<number> {
  const [row] = await tx
    .insert(products)
    .values({ ...productColumns(fields), createdAt: now })
    .returning({ id: products.id });
  if (row === undefined) throw new Error('product insert returned no row');
  await replaceImages(tx, row.id, fields);
  return row.id;
}

export async function updateProduct(tx: Tx, id: number, fields: ProductFields): Promise<boolean> {
  const updated = await tx
    .update(products)
    .set(productColumns(fields))
    .where(eq(products.id, id))
    .returning({ id: products.id });
  if (updated.length === 0) return false;
  await replaceImages(tx, id, fields);
  return true;
}

export async function setArchived(tx: Tx, id: number, archived: boolean): Promise<boolean> {
  const updated = await tx
    .update(products)
    .set({ archived })
    .where(eq(products.id, id))
    .returning({ id: products.id });
  return updated.length > 0;
}

export async function slugTaken(db: Reader, slug: string, exceptId?: number): Promise<boolean> {
  const [row] = await db
    .select({ id: products.id })
    .from(products)
    .where(
      exceptId === undefined
        ? eq(products.slug, slug)
        : and(eq(products.slug, slug), sql`${products.id} != ${exceptId}`),
    );
  return row !== undefined;
}

export async function skuTaken(db: Reader, sku: string, exceptId?: number): Promise<boolean> {
  const [row] = await db
    .select({ id: variants.id })
    .from(variants)
    .where(
      exceptId === undefined
        ? eq(variants.sku, sku)
        : and(eq(variants.sku, sku), sql`${variants.id} != ${exceptId}`),
    );
  return row !== undefined;
}

export interface VariantFields {
  readonly sku: string;
  readonly options: Readonly<Record<string, string>>;
  readonly priceCents: number | null;
}

/** New variants start with no stock; stock arrives through adjustStock (audited). */
export async function insertVariant(tx: Tx, productId: number, fields: VariantFields) {
  const [last] = await tx
    .select({ position: sql<number>`coalesce(max(${variants.position}), -1)`.mapWith(Number) })
    .from(variants)
    .where(eq(variants.productId, productId));
  const [row] = await tx
    .insert(variants)
    .values({ productId, ...fields, stock: 0, position: (last?.position ?? -1) + 1 })
    .returning({ id: variants.id });
  if (row === undefined) throw new Error('variant insert returned no row');
  return row.id;
}

/** Updates a variant; returns its product id, or undefined when it doesn't exist. */
export async function updateVariant(tx: Tx, id: number, fields: VariantFields) {
  const [row] = await tx
    .update(variants)
    .set(fields)
    .where(eq(variants.id, id))
    .returning({ productId: variants.productId });
  return row?.productId;
}

export async function variantProduct(db: Reader, variantId: number): Promise<number | undefined> {
  const [row] = await db
    .select({ productId: variants.productId })
    .from(variants)
    .where(eq(variants.id, variantId));
  return row?.productId;
}

/**
 * Adds `delta` (negative to remove) only if stock stays at or above zero, and logs it.
 * Returns the new stock, or undefined when the variant is missing or stock would go negative.
 */
export async function adjustStock(
  tx: Tx,
  input: { variantId: number; delta: number; reason: string; actorId: number; now: Date },
): Promise<number | undefined> {
  const [row] = await tx
    .update(variants)
    .set({ stock: sql`${variants.stock} + ${input.delta}` })
    .where(and(eq(variants.id, input.variantId), sql`${variants.stock} + ${input.delta} >= 0`))
    .returning({ stock: variants.stock });
  if (row === undefined) return undefined;
  await tx.insert(inventoryLog).values({
    variantId: input.variantId,
    delta: input.delta,
    reason: input.reason,
    actorUserId: input.actorId,
    createdAt: input.now,
  });
  return row.stock;
}

/** Units across a product's variants (for tests and the dashboard). */
export async function productStock(db: Reader, productId: number): Promise<number> {
  const [row] = await db
    .select({ n: sum(variants.stock).mapWith(Number) })
    .from(variants)
    .where(eq(variants.productId, productId));
  return row?.n ?? 0;
}

// Cart persistence (docs/product-specs/cart.md). Rows only; services/cart.ts owns the rules.
import { and, asc, eq, inArray, isNull, min } from 'drizzle-orm';
import type { Db } from '../client.js';
import {
  cartLines,
  carts,
  departments,
  productImages,
  products,
  promoCodes,
  variants,
} from '../schema.js';

export interface CartRow {
  readonly id: number;
  readonly sessionId: string | null;
  readonly userId: number | null;
  readonly promoCode: string | null;
}

/** A cart line joined with everything the cart view and the price pipeline need. */
export interface CartLineRow {
  readonly variantId: number;
  readonly sku: string;
  readonly quantity: number;
  readonly options: Readonly<Record<string, string>>;
  readonly stock: number;
  readonly productId: number;
  readonly productSlug: string;
  readonly productName: string;
  readonly archived: boolean;
  /** The variant's own price when set, else the product's. */
  readonly priceCents: number;
  readonly salePriceCents: number | null;
  readonly departmentSlug: string;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
}

export interface VariantRow {
  readonly id: number;
  readonly sku: string;
  readonly stock: number;
  readonly productName: string;
  readonly archived: boolean;
}

export interface PromoRow {
  readonly code: string;
  readonly kind: 'percent' | 'fixed';
  readonly amount: number;
  readonly minSubtotalCents: number;
  readonly departmentSlug: string | null;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly usageLimit: number | null;
  readonly usedCount: number;
  readonly active: boolean;
}

const cartColumns = {
  id: carts.id,
  sessionId: carts.sessionId,
  userId: carts.userId,
  promoCode: carts.promoCode,
};

/** The guest cart attached to a session (member carts are found by user instead). */
export async function findSessionCart(db: Db, sessionId: string): Promise<CartRow | undefined> {
  const [row] = await db
    .select(cartColumns)
    .from(carts)
    .where(and(eq(carts.sessionId, sessionId), isNull(carts.userId)));
  return row;
}

export async function findUserCart(db: Db, userId: number): Promise<CartRow | undefined> {
  const [row] = await db.select(cartColumns).from(carts).where(eq(carts.userId, userId));
  return row;
}

export async function createCart(
  db: Db,
  owner: { readonly sessionId: string } | { readonly userId: number },
): Promise<CartRow> {
  const [row] = await db
    .insert(carts)
    .values('userId' in owner ? { userId: owner.userId } : { sessionId: owner.sessionId })
    .returning(cartColumns);
  if (row === undefined) throw new Error('createCart: insert returned no row');
  return row;
}

export async function deleteCart(db: Db, cartId: number): Promise<void> {
  await db.delete(carts).where(eq(carts.id, cartId));
}

/** Lines in the order they were added, joined with product, variant and first image. */
export async function cartLineRows(db: Db, cartId: number): Promise<CartLineRow[]> {
  const firstImage = db
    .select({ productId: productImages.productId, position: min(productImages.position).as('p') })
    .from(productImages)
    .groupBy(productImages.productId)
    .as('first_image');
  const rows = await db
    .select({
      variantId: variants.id,
      sku: variants.sku,
      quantity: cartLines.quantity,
      options: variants.options,
      stock: variants.stock,
      productId: products.id,
      productSlug: products.slug,
      productName: products.name,
      archived: products.archived,
      variantPrice: variants.priceCents,
      productPrice: products.priceCents,
      salePriceCents: products.salePriceCents,
      departmentSlug: departments.slug,
      imageUrl: productImages.url,
      imageAlt: productImages.alt,
    })
    .from(cartLines)
    .innerJoin(variants, eq(variants.id, cartLines.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .innerJoin(departments, eq(departments.id, products.departmentId))
    .leftJoin(firstImage, eq(firstImage.productId, products.id))
    .leftJoin(
      productImages,
      and(
        eq(productImages.productId, products.id),
        eq(productImages.position, firstImage.position),
      ),
    )
    .where(eq(cartLines.cartId, cartId))
    .orderBy(asc(cartLines.id));
  return rows.map(({ variantPrice, productPrice, ...row }) => ({
    ...row,
    priceCents: variantPrice ?? productPrice,
  }));
}

export async function findVariantBySku(db: Db, sku: string): Promise<VariantRow | undefined> {
  const [row] = await db
    .select({
      id: variants.id,
      sku: variants.sku,
      stock: variants.stock,
      productName: products.name,
      archived: products.archived,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(eq(variants.sku, sku));
  return row;
}

/** Current stock for SKUs (missing SKUs are absent from the map). */
export async function stockBySku(
  db: Db,
  skus: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  if (skus.length === 0) return new Map();
  const rows = await db
    .select({ sku: variants.sku, stock: variants.stock })
    .from(variants)
    .where(inArray(variants.sku, [...skus]));
  return new Map(rows.map((r) => [r.sku, r.stock]));
}

/** Sets a line's quantity; 0 deletes it. */
export async function putLine(
  db: Db,
  cartId: number,
  variantId: number,
  quantity: number,
): Promise<void> {
  if (quantity <= 0) {
    await db
      .delete(cartLines)
      .where(and(eq(cartLines.cartId, cartId), eq(cartLines.variantId, variantId)));
  } else {
    await db
      .insert(cartLines)
      .values({ cartId, variantId, quantity })
      .onConflictDoUpdate({
        target: [cartLines.cartId, cartLines.variantId],
        set: { quantity },
      });
  }
  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
}

/** Replaces every line of a cart (used by the login merge). */
export async function replaceLines(
  db: Db,
  cartId: number,
  lines: readonly { readonly variantId: number; readonly quantity: number }[],
): Promise<void> {
  await db.delete(cartLines).where(eq(cartLines.cartId, cartId));
  if (lines.length > 0) {
    await db.insert(cartLines).values(lines.map((l) => ({ cartId, ...l })));
  }
}

export async function setPromoCode(db: Db, cartId: number, code: string | null): Promise<void> {
  await db
    .update(carts)
    .set({ promoCode: code, updatedAt: new Date() })
    .where(eq(carts.id, cartId));
}

export async function findPromo(db: Db, code: string): Promise<PromoRow | undefined> {
  const [row] = await db
    .select({
      code: promoCodes.code,
      kind: promoCodes.kind,
      amount: promoCodes.amount,
      minSubtotalCents: promoCodes.minSubtotalCents,
      departmentSlug: departments.slug,
      startsAt: promoCodes.startsAt,
      endsAt: promoCodes.endsAt,
      usageLimit: promoCodes.usageLimit,
      usedCount: promoCodes.usedCount,
      active: promoCodes.active,
    })
    .from(promoCodes)
    .leftJoin(departments, eq(departments.id, promoCodes.departmentId))
    .where(eq(promoCodes.code, code));
  return row;
}

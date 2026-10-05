// Cart use-cases (docs/product-specs/cart.md). Guests' carts hang off their session; members'
// carts are stored by user and survive across devices. Promo usage is only counted when an
// order is placed (checkout), never here.
import type { Db } from '../db/client.js';
import {
  cartLineRows,
  createCart,
  deleteCart,
  findPromo,
  findSessionCart,
  findUserCart,
  findVariantBySku,
  putLine,
  replaceLines,
  setPromoCode,
  stockBySku,
  type CartRow,
} from '../db/repos/cart.js';
import { skuCode, type SkuCode } from '../domain/catalog.js';
import { clampQuantity, mergeCarts, type MergeAdjustment } from '../domain/inventory.js';
import { normalizeCode, promoErrorMessage } from '../domain/promos.js';
import { err, ok, type Result } from '../domain/result.js';
import { promoFromRow } from '../db/mapping.js';
import { buildCartView, emptyCartView, type CartView } from './cart-view.js';

/** Who the cart belongs to: a member (by user) or a guest (by session). */
export type CartOwner =
  | { readonly kind: 'member'; readonly userId: number }
  | { readonly kind: 'guest'; readonly sessionId: string };

export type CartError =
  | { readonly _tag: 'UnknownSku'; readonly sku: string }
  | { readonly _tag: 'OutOfStock'; readonly sku: string; readonly name: string }
  | { readonly _tag: 'NotInCart'; readonly sku: string }
  | { readonly _tag: 'PromoRejected'; readonly code: string; readonly message: string };

/** What an operation did, phrased for the customer (flash messages, status regions). */
export interface CartNotice {
  readonly message: string;
}

export type CartResult = Result<CartNotice, CartError>;

async function findCart(db: Db, owner: CartOwner): Promise<CartRow | undefined> {
  return owner.kind === 'member'
    ? findUserCart(db, owner.userId)
    : findSessionCart(db, owner.sessionId);
}

async function cartFor(db: Db, owner: CartOwner): Promise<CartRow> {
  return (
    (await findCart(db, owner)) ??
    createCart(
      db,
      owner.kind === 'member' ? { userId: owner.userId } : { sessionId: owner.sessionId },
    )
  );
}

export async function viewCart(db: Db, owner: CartOwner | undefined, now: Date): Promise<CartView> {
  const cart = owner === undefined ? undefined : await findCart(db, owner);
  if (cart === undefined) return emptyCartView(now);
  const [rows, promoRow] = await Promise.all([
    cartLineRows(db, cart.id),
    cart.promoCode === null ? undefined : findPromo(db, cart.promoCode),
  ]);
  return buildCartView({
    rows,
    promoCode: cart.promoCode ?? undefined,
    promo: promoFromRow(promoRow),
    now,
  });
}

const plural = (n: number, word: string) => `${String(n)} ${word}${n === 1 ? '' : 's'}`;

/** Adds to a line (quantities add), clamped to stock and the per-line maximum. */
export async function addToCart(
  db: Db,
  owner: CartOwner,
  sku: string,
  quantity: number,
): Promise<CartResult> {
  const variant = await findVariantBySku(db, sku);
  if (variant === undefined || variant.archived) return err({ _tag: 'UnknownSku', sku });
  if (variant.stock <= 0) {
    return err({ _tag: 'OutOfStock', sku, name: variant.productName });
  }
  const cart = await cartFor(db, owner);
  const current = (await cartLineRows(db, cart.id)).find((l) => l.sku === sku)?.quantity ?? 0;
  const requested = current + quantity;
  const kept = clampQuantity(requested, variant.stock);
  await putLine(db, cart.id, variant.id, kept);
  if (kept < requested) {
    return ok({
      message: `You can buy up to ${plural(kept, 'item')} of ${variant.productName}; your cart has ${String(kept)}.`,
    });
  }
  return ok({
    message: `Added ${plural(quantity, 'item')} of ${variant.productName} to your cart.`,
  });
}

/** Sets a line's quantity (0 removes it), clamped to stock and the per-line maximum. */
export async function setCartQuantity(
  db: Db,
  owner: CartOwner,
  sku: string,
  quantity: number,
): Promise<CartResult> {
  const cart = await findCart(db, owner);
  const line =
    cart === undefined ? undefined : (await cartLineRows(db, cart.id)).find((l) => l.sku === sku);
  if (cart === undefined || line === undefined) return err({ _tag: 'NotInCart', sku });
  const kept = clampQuantity(quantity, line.stock);
  await putLine(db, cart.id, line.variantId, kept);
  if (kept === 0) return ok({ message: `Removed ${line.productName} from your cart.` });
  if (kept < quantity) {
    return ok({ message: `Only ${String(kept)} of ${line.productName} can be bought.` });
  }
  return ok({ message: `Updated ${line.productName} to ${String(kept)}.` });
}

export async function removeFromCart(db: Db, owner: CartOwner, sku: string): Promise<CartResult> {
  return setCartQuantity(db, owner, sku, 0);
}

/** Applies a promo code if it applies to the cart as it is now; otherwise explains why not. */
export async function applyPromoCode(
  db: Db,
  owner: CartOwner,
  input: string,
  now: Date,
): Promise<CartResult> {
  const code = normalizeCode(input);
  const promo = promoFromRow(await findPromo(db, code));
  if (promo === undefined) {
    return err({ _tag: 'PromoRejected', code, message: `${code} isn't a valid promo code.` });
  }
  const cart = await findCart(db, owner);
  const rows = cart === undefined ? [] : await cartLineRows(db, cart.id);
  if (cart === undefined || rows.length === 0) {
    return err({
      _tag: 'PromoRejected',
      code,
      message: 'Add items to your cart before applying a promo code.',
    });
  }
  const { breakdown } = buildCartView({ rows, promoCode: code, promo, now });
  if (breakdown.promoError !== undefined) {
    return err({ _tag: 'PromoRejected', code, message: promoErrorMessage(breakdown.promoError) });
  }
  await setPromoCode(db, cart.id, code);
  return ok({ message: `Promo code ${code} applied.` });
}

export async function removePromoCode(db: Db, owner: CartOwner): Promise<CartResult> {
  const cart = await findCart(db, owner);
  if (cart !== undefined) await setPromoCode(db, cart.id, null);
  return ok({ message: 'Promo code removed.' });
}

/**
 * On login: the guest cart (now attached to the member's fresh session) merges into the
 * member's cart. Quantities add, capped by stock and the per-line maximum (domain mergeCarts).
 * Returns the lines that had to be reduced.
 */
export async function mergeGuestCart(
  db: Db,
  sessionId: string,
  userId: number,
): Promise<readonly MergeAdjustment[]> {
  return db.transaction(async (txn) => {
    // A transaction has the same query API as the database for everything used here.
    const tx = txn as unknown as Db;
    const guest = await findSessionCart(tx, sessionId);
    if (guest === undefined) return [];
    const member = (await findUserCart(tx, userId)) ?? (await createCart(tx, { userId }));
    const [guestRows, memberRows] = await Promise.all([
      cartLineRows(tx, guest.id),
      cartLineRows(tx, member.id),
    ]);
    const variantIds = new Map<string, number>();
    const toLines = (rows: typeof guestRows) =>
      rows.flatMap((r) => {
        const sku = skuCode(r.sku);
        if (!sku.ok) return [];
        variantIds.set(r.sku, r.variantId);
        return [{ sku: sku.value, qty: r.quantity }];
      });
    const memberLines = toLines(memberRows);
    const guestLines = toLines(guestRows);
    const stock = await stockBySku(tx, [...variantIds.keys()]);
    const merged = mergeCarts(memberLines, guestLines, stock as ReadonlyMap<SkuCode, number>);
    await replaceLines(
      tx,
      member.id,
      merged.lines.flatMap((l) => {
        const variantId = variantIds.get(l.sku);
        return variantId === undefined ? [] : [{ variantId, quantity: l.qty }];
      }),
    );
    const promo = member.promoCode ?? guest.promoCode;
    if (promo !== member.promoCode) await setPromoCode(tx, member.id, promo);
    await deleteCart(tx, guest.id);
    return merged.adjustments;
  });
}

/** A customer-facing message for a cart error. */
export function cartErrorMessage(error: CartError): string {
  switch (error._tag) {
    case 'UnknownSku':
      return 'That item is not available.';
    case 'OutOfStock':
      return `${error.name} is out of stock.`;
    case 'NotInCart':
      return 'That item is no longer in your cart.';
    case 'PromoRejected':
      return error.message;
  }
}

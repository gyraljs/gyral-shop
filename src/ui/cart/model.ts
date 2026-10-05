// The cart as the browser sees it (docs/product-specs/cart.md): a lean, JSON-safe subset of the
// server's CartView. The server seeds it into every page (Gyral store, ADR 0013) and the JSON
// API answers with the full view, which is parsed here once, at the boundary.
import * as v from 'valibot';
import { times, usd, type Money } from '../../domain/money.js';

const Cents = v.pipe(v.number(), v.integer());
const MoneySchema = v.object({ cents: Cents, currency: v.literal('USD') });

const LineIssueSchema = v.variant('_tag', [
  v.object({ _tag: v.literal('Unavailable') }),
  v.object({ _tag: v.literal('OutOfStock') }),
  v.object({ _tag: v.literal('NotEnoughStock'), available: v.number() }),
]);

const CartLineSchema = v.object({
  sku: v.string(),
  quantity: v.pipe(v.number(), v.integer(), v.minValue(0)),
  productName: v.string(),
  href: v.string(),
  options: v.record(v.string(), v.string()),
  image: v.optional(v.object({ url: v.string(), alt: v.string() })),
  unit: MoneySchema,
  listPrice: MoneySchema,
  onSale: v.boolean(),
  lineTotal: MoneySchema,
  maxQuantity: v.pipe(v.number(), v.integer(), v.minValue(0)),
  issue: v.optional(LineIssueSchema),
});

const TotalsSchema = v.object({
  subtotal: MoneySchema,
  savings: MoneySchema,
  discount: MoneySchema,
  shipping: MoneySchema,
  tax: MoneySchema,
  taxPending: v.boolean(),
  total: MoneySchema,
});

const PromoSchema = v.object({
  code: v.string(),
  applied: v.boolean(),
  message: v.optional(v.string()),
});

/** The cart view model the UI renders. */
export const CartClientSchema = v.object({
  lines: v.array(CartLineSchema),
  itemCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  totals: TotalsSchema,
  promo: v.optional(PromoSchema),
  canCheckout: v.boolean(),
});

export type CartClient = v.InferOutput<typeof CartClientSchema>;
export type CartLine = v.InferOutput<typeof CartLineSchema>;
export type LineIssue = v.InferOutput<typeof LineIssueSchema>;

/**
 * What every /api/cart response carries. The server's view nests totals in `breakdown`; it is
 * reshaped into `totals` here so the seed and the API produce the same client model.
 */
const ServerCartSchema = v.pipe(
  v.object({
    lines: v.array(CartLineSchema),
    itemCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
    breakdown: TotalsSchema,
    promo: v.optional(PromoSchema),
    canCheckout: v.boolean(),
  }),
  v.transform(({ breakdown, ...rest }): CartClient => ({ ...rest, totals: breakdown })),
);

export const ApiAnswerSchema = v.object({
  cart: v.optional(ServerCartSchema),
  notice: v.optional(v.string()),
  error: v.optional(v.object({ _tag: v.string(), message: v.string() })),
});

export type ApiAnswer = v.InferOutput<typeof ApiAnswerSchema>;

/** Parses a server cart view (seed or API) into the client model; throws on a bad shape. */
export const parseServerCart = (value: unknown): CartClient => v.parse(ServerCartSchema, value);

/** A one-line, human message for a line issue (same wording as the server's). */
export function lineIssueMessage(issue: LineIssue): string {
  switch (issue._tag) {
    case 'Unavailable':
      return 'This item is no longer available.';
    case 'OutOfStock':
      return 'Out of stock.';
    case 'NotEnoughStock':
      return `Only ${String(issue.available)} available.`;
  }
}

const recount = (lines: readonly CartLine[]): number =>
  lines.reduce((n, l) => n + (l.issue === undefined ? l.quantity : 0), 0);

/**
 * The optimistic cart after changing one line's quantity: the line and the item count update
 * at once; totals stay as they were until the server's answer replaces the whole cart.
 * Zero removes the line, as the server does.
 */
export function withQuantity(cart: CartClient, sku: string, quantity: number): CartClient {
  if (quantity <= 0) return withoutLine(cart, sku);
  const lines = cart.lines.map((l) => {
    if (l.sku !== sku) return l;
    const q = Math.min(quantity, Math.max(l.maxQuantity, 1));
    return { ...l, quantity: q, lineTotal: times(l.unit, q) };
  });
  return { ...cart, lines, itemCount: recount(lines) };
}

/** The optimistic cart without one line. */
export function withoutLine(cart: CartClient, sku: string): CartClient {
  const lines = cart.lines.filter((l) => l.sku !== sku);
  return {
    ...cart,
    lines,
    itemCount: recount(lines),
    canCheckout: lines.length > 0 && cart.canCheckout,
  };
}

/** Subtotal of the lines as shown (used while totals are being recalculated). */
export const shownSubtotal = (cart: CartClient): Money =>
  usd(cart.lines.reduce((n, l) => n + l.lineTotal.cents, 0));

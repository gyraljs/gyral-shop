// The checkout view model the browser renders (server seed and JSON answers alike). Parsed with
// valibot at the boundary, so a fetched view and the seeded one are the same JSON-safe shape.
import * as v from 'valibot';
import { CHECKOUT_STEPS } from '../../domain/checkout.js';
import { SHIPPING_METHODS } from '../../domain/shipping.js';

const money = v.object({ cents: v.number(), currency: v.literal('USD') });

const address = v.object({
  name: v.string(),
  line1: v.string(),
  line2: v.string(),
  city: v.string(),
  state: v.string(),
  postalCode: v.string(),
  phone: v.string(),
});

export const CheckoutClientSchema = v.object({
  open: v.picklist(CHECKOUT_STEPS),
  steps: v.array(
    v.object({
      step: v.picklist(CHECKOUT_STEPS),
      status: v.picklist(['done', 'open', 'locked']),
    }),
  ),
  email: v.optional(v.string()),
  memberEmail: v.optional(v.string()),
  address: v.optional(address),
  shippingMethod: v.optional(v.picklist(SHIPPING_METHODS)),
  card: v.optional(
    v.object({
      brand: v.picklist(['visa', 'mastercard', 'amex', 'discover']),
      last4: v.string(),
      expMonth: v.number(),
      expYear: v.number(),
    }),
  ),
  savedAddresses: v.array(v.object({ ...address.entries, id: v.number(), isDefault: v.boolean() })),
  shippingOptions: v.array(
    v.object({
      method: v.picklist(SHIPPING_METHODS),
      label: v.string(),
      price: money,
      days: v.object({ min: v.number(), max: v.number() }),
    }),
  ),
  lines: v.array(
    v.object({
      sku: v.string(),
      name: v.string(),
      href: v.string(),
      options: v.record(v.string(), v.string()),
      quantity: v.number(),
      lineTotal: money,
    }),
  ),
  totals: v.object({
    subtotal: money,
    discount: money,
    shipping: money,
    tax: money,
    taxPending: v.boolean(),
    total: money,
    promoCode: v.optional(v.string()),
  }),
  ready: v.boolean(),
  /** Present once ready: identifies this placement, so a repeated submit finds its order. */
  placeKey: v.optional(v.string()),
});

export type CheckoutClient = v.InferOutput<typeof CheckoutClientSchema>;

/** Parses an untrusted view (a JSON answer); undefined when it isn't one. */
export function parseCheckout(input: unknown): CheckoutClient | undefined {
  const result = v.safeParse(CheckoutClientSchema, input);
  return result.success ? result.output : undefined;
}

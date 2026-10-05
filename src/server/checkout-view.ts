// Builds the browser's checkout view model from the service state (server render and JSON
// answers use the same function, through the same parser, so they can't drift apart).
import { readyToPlace, stepStatuses, type CheckoutStep } from '../domain/checkout.js';
import type { CheckoutState } from '../services/checkout.js';
import { parseCheckout, type CheckoutClient } from '../ui/checkout/model.js';

export function toCheckoutClient(
  state: CheckoutState,
  edit?: CheckoutStep,
  placeKey?: string,
): CheckoutClient {
  const { draft, breakdown } = state;
  const steps = stepStatuses(draft, edit);
  const open = steps.find((s) => s.status === 'open')?.step ?? 'contact';
  const view = {
    open,
    steps,
    ...(draft.email === undefined ? {} : { email: draft.email }),
    ...(state.memberEmail === undefined ? {} : { memberEmail: state.memberEmail }),
    ...(draft.address === undefined ? {} : { address: draft.address }),
    ...(draft.shippingMethod === undefined ? {} : { shippingMethod: draft.shippingMethod }),
    ...(draft.card === undefined
      ? {}
      : {
          card: {
            brand: draft.card.brand,
            last4: draft.card.last4,
            expMonth: draft.card.expMonth,
            expYear: draft.card.expYear,
          },
        }),
    savedAddresses: state.savedAddresses,
    shippingOptions: state.shippingOptions,
    lines: state.cart.lines.map((l) => ({
      sku: l.sku,
      name: l.productName,
      href: l.href,
      options: l.options,
      quantity: l.quantity,
      lineTotal: l.lineTotal,
    })),
    totals: {
      subtotal: breakdown.subtotal,
      discount: breakdown.discount,
      shipping: breakdown.shipping,
      tax: breakdown.tax,
      taxPending: breakdown.taxPending,
      total: breakdown.total,
      ...(breakdown.promo === undefined ? {} : { promoCode: breakdown.promo.code }),
    },
    ready: readyToPlace(draft),
    ...(placeKey === undefined || !readyToPlace(draft) ? {} : { placeKey }),
  };
  // Through JSON and the browser's parser: proves the seed is JSON-safe and well formed.
  const parsed = parseCheckout(JSON.parse(JSON.stringify(view)));
  if (parsed === undefined) throw new Error('checkout view does not match its schema');
  return parsed;
}

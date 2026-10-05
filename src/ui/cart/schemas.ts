// Cart form inputs, parsed in the browser by Gyral form() intents (ADR 0008 in Gyral). The
// server parses the same fields again in src/server/routes/cart-api.ts for the no-JS path.
import * as v from 'valibot';

const Sku = v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(64));

const Quantity = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty('Enter a quantity.'),
  v.transform(Number),
  v.integer('Enter a whole number.'),
  v.minValue(0, 'Enter a quantity of 0 or more.'),
  v.maxValue(999, 'That quantity is too large.'),
);

export const SetQuantityForm = v.object({ sku: Sku, quantity: Quantity });
export const RemoveForm = v.object({ sku: Sku });
export const PromoForm = v.object({
  code: v.pipe(v.string(), v.trim(), v.nonEmpty('Enter a promo code.'), v.maxLength(32)),
});
export const AddForm = v.object({
  sku: v.pipe(v.string('Choose an option.'), v.trim(), v.nonEmpty('Choose an option.')),
  quantity: v.optional(Quantity, '1'),
});

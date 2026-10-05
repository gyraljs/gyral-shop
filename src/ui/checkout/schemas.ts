// One schema per checkout step, shared by the browser's form() intents and the server's
// formAction() handlers (Gyral ADR 0008), so both paths reject identically. Card checks reuse the
// domain rules, so a card the browser accepts is a card the server accepts.
import { defineForm } from '@gyral/core';
import * as v from 'valibot';
import { validateCard } from '../../domain/cards.js';
import { normalizePostalCode } from '../../domain/checkout.js';
import { SHIPPING_METHODS } from '../../domain/shipping.js';
import { isStateCode } from '../../domain/tax.js';

const text = (max = 120) => v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(max));

export const ContactForm = defineForm(
  v.object({
    email: v.pipe(
      v.string(),
      v.trim(),
      v.toLowerCase(),
      v.nonEmpty('Enter your email address.'),
      v.email('Enter a valid email address.'),
    ),
  }),
);

/** Field rules that apply only to a new address (`addressId` = `new`). */
const NEW_ADDRESS_RULES: readonly {
  readonly field: 'name' | 'line1' | 'city' | 'state' | 'postalCode';
  readonly message: string;
  readonly ok: (value: string) => boolean;
}[] = [
  { field: 'name', message: 'Enter the recipient’s name.', ok: (x) => x !== '' },
  { field: 'line1', message: 'Enter the street address.', ok: (x) => x !== '' },
  { field: 'city', message: 'Enter the city.', ok: (x) => x !== '' },
  { field: 'state', message: 'Choose a state.', ok: isStateCode },
  {
    field: 'postalCode',
    message: 'Enter a 5-digit ZIP code.',
    ok: (x) => normalizePostalCode(x) !== undefined,
  },
];

/** `addressId` is a member's saved address id, or `new` with the fields below filled in. */
export const AddressForm = defineForm(
  v.pipe(
    v.object({
      addressId: v.optional(v.string(), 'new'),
      name: text(),
      line1: text(),
      line2: text(),
      city: text(80),
      state: text(2),
      postalCode: text(10),
      phone: text(30),
      save: v.optional(v.string(), ''),
    }),
    v.rawCheck(({ dataset, addIssue }) => {
      if (!dataset.typed || dataset.value.addressId !== 'new') return;
      const input = dataset.value;
      for (const rule of NEW_ADDRESS_RULES) {
        if (rule.ok(input[rule.field])) continue;
        addIssue({
          message: rule.message,
          path: [
            { type: 'object', origin: 'value', input, key: rule.field, value: input[rule.field] },
          ],
        });
      }
    }),
  ),
);

export const ShippingForm = defineForm(
  v.object({ method: v.picklist(SHIPPING_METHODS, 'Choose a shipping method.') }),
);

const CARD_FIELDS = ['number', 'expiry', 'cvc'] as const;

export const PaymentForm = defineForm(
  v.pipe(
    v.object({ number: v.string(), expiry: v.string(), cvc: v.string() }),
    v.rawCheck(({ dataset, addIssue }) => {
      if (!dataset.typed) return;
      const card = dataset.value;
      const result = validateCard(card, new Date());
      if (result.ok) return;
      for (const issue of result.error) {
        addIssue({
          message: issue.message,
          path: [
            {
              type: 'object',
              origin: 'value',
              input: card,
              key: issue.field,
              value: card[issue.field],
            },
          ],
        });
      }
    }),
  ),
);

export const PlaceOrderForm = defineForm(
  v.object({
    // An unchecked box is absent from the form data, so default it before checking.
    terms: v.pipe(
      v.optional(v.string(), ''),
      v.check((value) => value === 'on', 'Accept the terms to place your order.'),
    ),
  }),
);

/** Card fields are never refilled into a page (state is serialized into the HTML). */
export const SECRET_FIELDS: ReadonlySet<string> = new Set([...CARD_FIELDS, '_csrf']);

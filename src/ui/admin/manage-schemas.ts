// Form schemas for admin promo codes, users and review moderation, shared by the browser's
// form() intents and the API's formAction() handlers (Gyral ADR 0008).
import { defineForm } from '@gyral/core';
import * as v from 'valibot';
import { parseDollars } from '../../domain/admin.js';
import {
  parsePromoAmount,
  PROMO_CODE_PATTERN,
  REVIEW_FILTERS,
  USER_ACTIONS,
} from '../../domain/admin-manage.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const optionalDate = (label: string) =>
  v.pipe(
    v.optional(v.string(), ''),
    v.trim(),
    v.check(
      (text) => text === '' || (DATE.test(text) && !Number.isNaN(Date.parse(text))),
      `Enter ${label} as a date, or leave it empty.`,
    ),
  );

export const PromoForm = defineForm(
  v.pipe(
    v.object({
      code: v.pipe(
        v.string(),
        v.trim(),
        v.toUpperCase(),
        v.nonEmpty('Enter a code.'),
        v.regex(PROMO_CODE_PATTERN, 'Use 3–24 letters, digits and hyphens, starting with one.'),
      ),
      kind: v.picklist(['percent', 'fixed'], 'Choose a discount type.'),
      amount: v.pipe(v.string(), v.trim(), v.nonEmpty('Enter the discount.')),
      minSubtotal: v.pipe(
        v.optional(v.string(), ''),
        v.trim(),
        v.check(
          (text) => text === '' || parseDollars(text) !== undefined,
          'Enter a minimum like 35.00, or leave it empty.',
        ),
      ),
      departmentId: v.pipe(
        v.optional(v.string(), ''),
        v.check((text) => text === '' || /^\d+$/.test(text), 'Choose a department.'),
      ),
      startsOn: optionalDate('the start'),
      endsOn: optionalDate('the end'),
      usageLimit: v.pipe(
        v.optional(v.string(), ''),
        v.trim(),
        v.check(
          (text) => text === '' || (/^\d{1,7}$/.test(text) && Number(text) > 0),
          'Enter a whole number above 0, or leave it empty for no limit.',
        ),
      ),
      active: v.picklist(['yes', 'no'], 'Choose whether the code can be used.'),
    }),
    v.forward(
      v.check(
        (form) => parsePromoAmount(form.kind, form.amount) !== undefined,
        'Enter a percent from 0.01 to 100, or an amount like 5.00.',
      ),
      ['amount'],
    ),
    v.forward(
      v.check(
        (form) => form.startsOn === '' || form.endsOn === '' || form.endsOn >= form.startsOn,
        'The last day must be on or after the first day.',
      ),
      ['endsOn'],
    ),
  ),
);

export const PromoDeleteForm = defineForm(v.object({ confirm: v.literal('yes') }));

/** Choosing an action only asks for confirmation; nothing is sent to the server yet. */
export const UserAskForm = defineForm(
  v.object({
    userId: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)),
    action: v.picklist(USER_ACTIONS),
  }),
);

export const UserActionForm = defineForm(
  v.object({
    userId: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)),
    action: v.picklist(USER_ACTIONS, 'Choose an action.'),
    confirm: v.literal('yes', 'Confirm the change first.'),
  }),
);

export const ReviewVisibilityForm = defineForm(
  v.object({
    reviewId: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)),
    hidden: v.picklist(['yes', 'no'], 'Choose hide or show.'),
  }),
);

export const ListFilterForm = v.object({
  q: v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(100, 'Use at most 100 characters.')),
  filter: v.optional(v.picklist(REVIEW_FILTERS), 'all'),
});

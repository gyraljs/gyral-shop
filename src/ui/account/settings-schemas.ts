// Schemas for the account-settings forms, shared by the browser's form() intents and the
// server's formAction() handlers (Gyral ADR 0008).
import { defineForm } from '@gyral/core';
import * as v from 'valibot';
import { MAX_NAME_LENGTH, passwordProblem } from '../../domain/accounts.js';
import { normalizePostalCode } from '../../domain/checkout.js';
import { isStateCode } from '../../domain/tax.js';

const name = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty('Enter your name.'),
  v.maxLength(MAX_NAME_LENGTH, `Use at most ${String(MAX_NAME_LENGTH)} characters.`),
);

export const email = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.nonEmpty('Enter your email address.'),
  v.email('Enter a valid email address.'),
);

const newPassword = v.pipe(
  v.string(),
  v.check(
    (password) => passwordProblem(password) === undefined,
    (issue) => passwordProblem(issue.input) ?? 'Choose another password.',
  ),
);

export const ProfileForm = defineForm(v.object({ name }));

export const EmailForm = defineForm(
  v.object({ email, current: v.pipe(v.string(), v.nonEmpty('Enter your current password.')) }),
);

export const PasswordForm = defineForm(
  v.pipe(
    v.object({
      current: v.pipe(v.string(), v.nonEmpty('Enter your current password.')),
      password: newPassword,
      confirm: v.string(),
    }),
    v.forward(
      v.partialCheck(
        [['password'], ['confirm']],
        (input) => input.password === input.confirm,
        'The passwords do not match.',
      ),
      ['confirm'],
    ),
  ),
);

export const ResetRequestForm = defineForm(v.object({ email }));

export const ResetForm = defineForm(
  v.pipe(
    v.object({
      token: v.pipe(v.string(), v.nonEmpty('This reset link is not valid.')),
      password: newPassword,
      confirm: v.string(),
    }),
    v.forward(
      v.partialCheck(
        [['password'], ['confirm']],
        (input) => input.password === input.confirm,
        'The passwords do not match.',
      ),
      ['confirm'],
    ),
  ),
);

const text = (max: number, message?: string) =>
  message === undefined
    ? v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(max))
    : v.pipe(v.optional(v.string(), ''), v.trim(), v.nonEmpty(message), v.maxLength(max));

export const AddressBookForm = defineForm(
  v.object({
    name: text(120, 'Enter the recipient’s name.'),
    line1: text(120, 'Enter the street address.'),
    line2: text(120),
    city: text(80, 'Enter the city.'),
    state: v.pipe(v.string(), v.check(isStateCode, 'Choose a state.')),
    postalCode: v.pipe(
      v.string(),
      v.transform((x) => normalizePostalCode(x) ?? ''),
      v.nonEmpty('Enter a 5-digit ZIP code.'),
    ),
    phone: text(30),
    isDefault: v.optional(v.picklist(['on']), undefined),
  }),
);

/** Fields never echoed back into a page after a rejection. */
export const SETTINGS_SECRETS = ['current', 'password', 'confirm', 'token'] as const;

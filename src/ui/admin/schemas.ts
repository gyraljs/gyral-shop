// Admin form schemas, shared by the browser's form() intents and the API's formAction()
// handlers (Gyral ADR 0008): the same checks run on both sides.
import { defineForm } from '@gyral/core';
import * as v from 'valibot';
import { parseDollars, parseImages, parseOptions } from '../../domain/admin.js';

const id = (label: string) =>
  v.pipe(
    v.string(),
    v.nonEmpty(`Choose a ${label}.`),
    v.transform(Number),
    v.integer(`Choose a ${label}.`),
    v.minValue(1, `Choose a ${label}.`),
  );

const dollars = (label: string) =>
  v.pipe(
    v.string(),
    v.trim(),
    v.check((text) => parseDollars(text) !== undefined, `Enter ${label} like 19.99.`),
  );

const optionalDollars = (label: string) =>
  v.pipe(
    v.optional(v.string(), ''),
    v.trim(),
    v.check(
      (text) => text === '' || parseDollars(text) !== undefined,
      `Enter ${label} like 19.99, or leave it empty.`,
    ),
  );

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ProductForm = defineForm(
  v.pipe(
    v.object({
      name: v.pipe(v.string(), v.trim(), v.nonEmpty('Enter a name.'), v.maxLength(200)),
      slug: v.pipe(
        v.string(),
        v.trim(),
        v.toLowerCase(),
        v.nonEmpty('Enter a URL slug.'),
        v.maxLength(120, 'Use at most 120 characters.'),
        v.regex(SLUG_PATTERN, 'Use lowercase letters, digits and single hyphens.'),
      ),
      description: v.pipe(
        v.string(),
        v.trim(),
        v.nonEmpty('Enter a description.'),
        v.maxLength(5000, 'Use at most 5000 characters.'),
      ),
      departmentId: id('department'),
      categoryId: id('category'),
      brandId: id('brand'),
      price: dollars('a price'),
      salePrice: optionalDollars('a sale price'),
      images: v.pipe(
        v.optional(v.string(), ''),
        v.check(
          (text) => parseImages(text, 'x') !== undefined,
          'Put one image URL per line (http(s):// or /path), optionally followed by | alt text.',
        ),
      ),
    }),
    v.forward(
      v.check(
        (form) =>
          form.salePrice === '' ||
          (parseDollars(form.salePrice) ?? 0) < (parseDollars(form.price) ?? 0),
        'The sale price must be lower than the price.',
      ),
      ['salePrice'],
    ),
  ),
);

export const VariantForm = defineForm(
  v.object({
    sku: v.pipe(
      v.string(),
      v.trim(),
      v.toUpperCase(),
      v.nonEmpty('Enter a SKU.'),
      v.maxLength(40, 'Use at most 40 characters.'),
      v.regex(/^[A-Z0-9][A-Z0-9-]*$/, 'Use letters, digits and hyphens.'),
    ),
    options: v.pipe(
      v.optional(v.string(), ''),
      v.trim(),
      v.check(
        (text) => parseOptions(text) !== undefined,
        'Write options as Name=Value pairs separated by semicolons, e.g. Size=M; Color=Navy.',
      ),
    ),
    price: optionalDollars('a price override'),
  }),
);

export const AdjustForm = defineForm(
  v.object({
    delta: v.pipe(
      v.string(),
      v.trim(),
      v.nonEmpty('Enter how many units to add or remove.'),
      v.transform(Number),
      v.integer('Enter a whole number, e.g. 12 or -3.'),
      v.minValue(-100_000, 'Enter at least -100000.'),
      v.maxValue(100_000, 'Enter at most 100000.'),
      v.check((n) => n !== 0, 'Enter a number other than 0.'),
    ),
    reason: v.pipe(
      v.string(),
      v.trim(),
      v.nonEmpty('Say why the stock changed.'),
      v.maxLength(200, 'Use at most 200 characters.'),
    ),
  }),
);

export const ArchiveForm = defineForm(
  v.object({ archived: v.picklist(['yes', 'no'], 'Choose archive or restore.') }),
);

export const RenameForm = defineForm(
  v.object({ name: v.pipe(v.string(), v.trim(), v.nonEmpty('Enter a name.'), v.maxLength(120)) }),
);

export const TransitionForm = defineForm(
  v.pipe(
    v.object({
      action: v.picklist(['Fulfil', 'Deliver', 'Cancel', 'Refund'], 'Choose an action.'),
      amount: optionalDollars('a refund amount'),
    }),
    v.forward(
      v.check(
        (form) => form.action !== 'Refund' || (parseDollars(form.amount) ?? 0) > 0,
        'Enter the amount to refund.',
      ),
      ['amount'],
    ),
  ),
);

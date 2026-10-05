// Variant selection (docs/product-specs/product-page.md): option axes such as Color and Size
// pick one SKU. Pure, so the server (no-JS form) and the browser component agree.
import { availability, type Availability } from './inventory.js';

/** What selection needs to know about one SKU. */
export interface VariantOption {
  readonly sku: string;
  /** Option values, e.g. `{ Color: 'Navy', Size: 'M' }`. Empty for single-SKU products. */
  readonly options: Readonly<Record<string, string>>;
  readonly stock: number;
}

/** One option axis and its values, in first-seen order. */
export interface Axis {
  readonly name: string;
  readonly values: readonly string[];
}

export type Selection = Readonly<Record<string, string>>;

/** Axes in the order they first appear across the variants. */
export function optionAxes(variants: readonly VariantOption[]): Axis[] {
  const axes = new Map<string, string[]>();
  for (const variant of variants) {
    for (const [name, value] of Object.entries(variant.options)) {
      const values = axes.get(name) ?? [];
      if (!values.includes(value)) values.push(value);
      axes.set(name, values);
    }
  }
  return [...axes].map(([name, values]) => ({ name, values }));
}

const matches = (variant: VariantOption, selection: Selection): boolean =>
  Object.entries(selection).every(([name, value]) => variant.options[name] === value);

/** The SKU whose options equal the selection on every axis, if any. */
export function resolveVariant<V extends VariantOption>(
  variants: readonly V[],
  selection: Selection,
): V | undefined {
  const axes = optionAxes(variants);
  if (axes.some((axis) => selection[axis.name] === undefined)) return undefined;
  return variants.find((v) => matches(v, selection));
}

/** The first in-stock variant's options, else the first variant's: what a page starts with. */
export function defaultSelection(variants: readonly VariantOption[]): Selection {
  const first = variants.find((v) => v.stock > 0) ?? variants[0];
  return first?.options ?? {};
}

/** Whether choosing `value` on `axis` (keeping the other choices) leads to a buyable SKU. */
export type ChoiceState =
  | { readonly _tag: 'Available' }
  | { readonly _tag: 'OutOfStock' }
  | { readonly _tag: 'Unavailable' };

export function choiceState(
  variants: readonly VariantOption[],
  selection: Selection,
  axis: string,
  value: string,
): ChoiceState {
  const wanted: Selection = { ...selection, [axis]: value };
  const candidate = variants.find((v) => matches(v, wanted));
  if (candidate === undefined) return { _tag: 'Unavailable' };
  return candidate.stock > 0 ? { _tag: 'Available' } : { _tag: 'OutOfStock' };
}

/**
 * Changes one axis. If the other choices no longer form a SKU, they move to the first
 * combination that does (preferring in-stock), so a selection always names a real SKU.
 */
export function choose(
  variants: readonly VariantOption[],
  selection: Selection,
  axis: string,
  value: string,
): Selection {
  const wanted: Selection = { ...selection, [axis]: value };
  if (variants.some((v) => matches(v, wanted))) return wanted;
  const withValue = variants.filter((v) => v.options[axis] === value);
  const best = withValue.find((v) => v.stock > 0) ?? withValue[0];
  return best?.options ?? selection;
}

/** A short reason a choice is disabled, for screen readers and tooltips. */
export function choiceReason(state: ChoiceState, axis: string, selection: Selection): string {
  const others = Object.entries(selection)
    .filter(([name]) => name !== axis)
    .map(([, value]) => value);
  switch (state._tag) {
    case 'Available':
      return '';
    case 'OutOfStock':
      return 'Out of stock';
    case 'Unavailable':
      return others.length === 0 ? 'Not available' : `Not available in ${others.join(' / ')}`;
  }
}

/** "Navy / M", or "" for single-SKU products. */
export const variantLabel = (variant: VariantOption): string =>
  Object.values(variant.options).join(' / ');

export const variantAvailability = (variant: VariantOption): Availability =>
  availability(variant.stock);

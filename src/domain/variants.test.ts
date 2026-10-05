import { describe, expect, it } from 'vitest';
import {
  choiceReason,
  choiceState,
  choose,
  defaultSelection,
  optionAxes,
  resolveVariant,
  variantLabel,
  type VariantOption,
} from './variants.js';

// Navy comes in S and M; Red only in M (and M is sold out); no Red S at all.
const shirt: VariantOption[] = [
  { sku: 'A-01', options: { Color: 'Navy', Size: 'S' }, stock: 0 },
  { sku: 'A-02', options: { Color: 'Navy', Size: 'M' }, stock: 4 },
  { sku: 'A-03', options: { Color: 'Red', Size: 'M' }, stock: 0 },
];
const single: VariantOption[] = [{ sku: 'B-01', options: {}, stock: 3 }];

describe('variant selection', () => {
  it('lists axes and values in first-seen order', () => {
    expect(optionAxes(shirt)).toEqual([
      { name: 'Color', values: ['Navy', 'Red'] },
      { name: 'Size', values: ['S', 'M'] },
    ]);
    expect(optionAxes(single)).toEqual([]);
  });

  it('resolves a complete selection to its SKU, and nothing for partial or unknown ones', () => {
    expect(resolveVariant(shirt, { Color: 'Navy', Size: 'M' })?.sku).toBe('A-02');
    expect(resolveVariant(shirt, { Color: 'Navy' })).toBeUndefined();
    expect(resolveVariant(shirt, { Color: 'Red', Size: 'S' })).toBeUndefined();
    expect(resolveVariant(single, {})?.sku).toBe('B-01');
  });

  it('starts on the first in-stock SKU', () => {
    expect(defaultSelection(shirt)).toEqual({ Color: 'Navy', Size: 'M' });
    expect(defaultSelection([{ sku: 'X', options: { Size: 'L' }, stock: 0 }])).toEqual({
      Size: 'L',
    });
    expect(defaultSelection([])).toEqual({});
  });

  it('marks each choice available, out of stock or unavailable, with a reason', () => {
    const navyM = { Color: 'Navy', Size: 'M' };
    expect(choiceState(shirt, navyM, 'Size', 'S')).toEqual({ _tag: 'OutOfStock' });
    expect(choiceState(shirt, navyM, 'Color', 'Red')).toEqual({ _tag: 'OutOfStock' });
    const redM = { Color: 'Red', Size: 'M' };
    const state = choiceState(shirt, redM, 'Size', 'S');
    expect(state).toEqual({ _tag: 'Unavailable' });
    expect(choiceReason(state, 'Size', redM)).toBe('Not available in Red');
    expect(choiceReason({ _tag: 'OutOfStock' }, 'Size', navyM)).toBe('Out of stock');
    expect(choiceReason({ _tag: 'Available' }, 'Size', navyM)).toBe('');
  });

  it('keeps the selection on a real SKU when a choice breaks the other axes', () => {
    expect(choose(shirt, { Color: 'Navy', Size: 'S' }, 'Color', 'Red')).toEqual({
      Color: 'Red',
      Size: 'M',
    });
    expect(choose(shirt, { Color: 'Navy', Size: 'M' }, 'Size', 'S')).toEqual({
      Color: 'Navy',
      Size: 'S',
    });
  });

  it('every reachable selection names a SKU', () => {
    let selection = defaultSelection(shirt);
    for (const axis of optionAxes(shirt)) {
      for (const value of axis.values) {
        selection = choose(shirt, selection, axis.name, value);
        expect(resolveVariant(shirt, selection)).toBeDefined();
      }
    }
  });

  it('labels variants by their option values', () => {
    const [first] = single;
    expect(variantLabel({ sku: 'A-02', options: { Color: 'Navy', Size: 'M' }, stock: 1 })).toBe(
      'Navy / M',
    );
    expect(first === undefined ? 'missing' : variantLabel(first)).toBe('');
  });
});

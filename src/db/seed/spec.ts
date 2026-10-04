// Shapes for the generated catalog (catalog spec). Data lives in hardlines/softlines/consumables.

export type OptionKind = 'apparel' | 'shoes' | 'color' | 'capacity' | 'none';

export interface CategorySpec {
  readonly slug: string;
  readonly name: string;
  readonly nouns: readonly string[];
  /** Price range in whole dollars. */
  readonly price: readonly [number, number];
  readonly options: OptionKind;
}

export interface DepartmentSpec {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly brands: readonly string[];
  /** Grocery staples are untaxed in many states (ADR 0003). */
  readonly taxable: boolean;
  readonly categories: readonly CategorySpec[];
}

export const c = (
  slug: string,
  name: string,
  price: readonly [number, number],
  options: OptionKind,
  nouns: readonly string[],
): CategorySpec => ({ slug, name, price, options, nouns });

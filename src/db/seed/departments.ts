import { CONSUMABLES } from './consumables.js';
import { HARDLINES } from './hardlines.js';
import { SOFTLINES } from './softlines.js';
import type { DepartmentSpec } from './spec.js';

export type { CategorySpec, DepartmentSpec, OptionKind } from './spec.js';

const ORDER = [
  'electronics',
  'home-kitchen',
  'clothing',
  'toys-games',
  'grocery',
  'beauty',
  'sports-outdoors',
  'books',
];

/** All departments in navigation order (retail groups them as hard/soft lines, consumables). */
export const DEPARTMENTS: readonly DepartmentSpec[] = [
  ...HARDLINES,
  ...SOFTLINES,
  ...CONSUMABLES,
].sort((a, b) => ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug));

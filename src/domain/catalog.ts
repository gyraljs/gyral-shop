// Catalog types shared by every layer (docs/product-specs/catalog.md).
import type { Money } from './money.js';
import { err, ok, type Result } from './result.js';

type Brand<T, B extends string> = T & { readonly __brand: B };

export type DepartmentId = Brand<string, 'DepartmentId'>;
export type CategoryId = Brand<string, 'CategoryId'>;
export type ProductId = Brand<string, 'ProductId'>;
export type SkuCode = Brand<string, 'SkuCode'>;

/** How a product is taxed (see tax.ts): most goods are standard. */
export type TaxClass = 'standard' | 'grocery' | 'clothing';

export interface Department {
  readonly id: DepartmentId;
  readonly name: string;
}

/** The store's departments, in navigation order. Ids double as URL slugs. */
const DEPARTMENT_NAMES = [
  { id: 'electronics', name: 'Electronics' },
  { id: 'home-kitchen', name: 'Home & Kitchen' },
  { id: 'clothing', name: 'Clothing' },
  { id: 'toys-games', name: 'Toys & Games' },
  { id: 'grocery', name: 'Grocery' },
  { id: 'beauty', name: 'Beauty' },
  { id: 'sports-outdoors', name: 'Sports & Outdoors' },
  { id: 'books', name: 'Books' },
] as const;

export const DEPARTMENTS: readonly Department[] = DEPARTMENT_NAMES.map((d) => ({
  id: d.id as DepartmentId,
  name: d.name,
}));

export interface Product {
  readonly id: ProductId;
  readonly slug: string;
  readonly name: string;
  readonly brand: string;
  readonly department: DepartmentId;
  readonly category: CategoryId;
  readonly description: string;
  readonly taxClass: TaxClass;
}

/** One purchasable variant (size, color …) of a product. */
export interface Sku {
  readonly code: SkuCode;
  readonly productId: ProductId;
  readonly options: Readonly<Record<string, string>>;
  readonly price: Money;
  /** Lower price while on sale; ignored unless strictly below `price`. */
  readonly salePrice?: Money;
  readonly stock: number;
}

export type IdError = { readonly _tag: 'InvalidId'; readonly kind: string; readonly value: string };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

const brand =
  <T extends string>(kind: string, pattern: RegExp) =>
  (value: string): Result<T, IdError> =>
    pattern.test(value) ? ok(value as T) : err({ _tag: 'InvalidId', kind, value });

export const departmentId = brand<DepartmentId>('department', SLUG);
export const categoryId = brand<CategoryId>('category', SLUG);
export const productId = brand<ProductId>('product', SLUG);
export const skuCode = brand<SkuCode>('sku', SKU);

export const isDepartment = (value: string): value is DepartmentId =>
  DEPARTMENTS.some((d) => d.id === value);

export const isOnSale = (sku: Pick<Sku, 'price' | 'salePrice'>): boolean =>
  sku.salePrice !== undefined && sku.salePrice.cents < sku.price.cents;

/** What the customer pays per unit: the sale price when it is a real discount. */
export const unitPrice = (sku: Pick<Sku, 'price' | 'salePrice'>): Money =>
  sku.salePrice !== undefined && isOnSale(sku) ? sku.salePrice : sku.price;

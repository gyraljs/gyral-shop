import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { bool, cents, createdAt } from './columns.js';

export const departments = sqliteTable('departments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  position: integer('position').notNull().default(0),
  /** Hidden from shoppers (admin taxonomy); only allowed with no live products. */
  archived: bool('archived').notNull().default(false),
});

export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    departmentId: integer('department_id')
      .notNull()
      .references(() => departments.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    archived: bool('archived').notNull().default(false),
  },
  (t) => [uniqueIndex('categories_department_slug').on(t.departmentId, t.slug)],
);

export const brands = sqliteTable('brands', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  archived: bool('archived').notNull().default(false),
});

export const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    departmentId: integer('department_id')
      .notNull()
      .references(() => departments.id),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    brandId: integer('brand_id')
      .notNull()
      .references(() => brands.id),
    priceCents: cents('price_cents').notNull(),
    salePriceCents: cents('sale_price_cents'),
    /** Sum and count, so the average is exact and cheap to update. */
    ratingSum: integer('rating_sum').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),
    taxable: bool('taxable').notNull().default(true),
    /** Specifications table as a JSON array of [name, value] pairs. */
    specs: text('specs', { mode: 'json' }).$type<readonly (readonly [string, string])[]>(),
    archived: bool('archived').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('products_category').on(t.categoryId),
    index('products_department').on(t.departmentId),
    index('products_brand').on(t.brandId),
  ],
);

/** A purchasable SKU. Products without options have exactly one variant. */
export const variants = sqliteTable(
  'variants',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    sku: text('sku').notNull().unique(),
    /** Option values, e.g. { "Size": "M", "Color": "Navy" }. Empty for single-SKU products. */
    options: text('options', { mode: 'json' }).$type<Readonly<Record<string, string>>>().notNull(),
    /** Overrides the product price when set. */
    priceCents: cents('price_cents'),
    stock: integer('stock').notNull().default(0),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('variants_product').on(t.productId)],
);

export const productImages = sqliteTable(
  'product_images',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    url: text('url').notNull(),
    alt: text('alt').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('product_images_product').on(t.productId)],
);

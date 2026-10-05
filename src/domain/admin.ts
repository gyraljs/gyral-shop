// Wire shapes of the admin JSON API (docs/product-specs/admin.md). The server builds these
// values; the browser decodes every response with the same schemas (parse at the boundary).
import * as v from 'valibot';

const cents = v.pipe(v.number(), v.integer());
const count = v.pipe(v.number(), v.integer(), v.minValue(0));
const isoDate = v.pipe(v.string(), v.isoTimestamp());

export const ORDER_STATUS_VALUES = [
  'pending_payment',
  'paid',
  'fulfilled',
  'delivered',
  'cancelled',
  'partially_refunded',
  'refunded',
] as const;
export const OrderStatusSchema = v.picklist(ORDER_STATUS_VALUES);
export type AdminOrderStatus = v.InferOutput<typeof OrderStatusSchema>;

const Sales = v.object({ orders: count, cents });

export const DashboardSchema = v.object({
  /** When the numbers were computed (server clock). */
  asOf: isoDate,
  sales: v.object({ today: Sales, week: Sales, month: Sales }),
  byStatus: v.array(v.object({ status: OrderStatusSchema, count })),
  lowStock: v.array(
    v.object({
      variantId: count,
      sku: v.string(),
      productId: count,
      product: v.string(),
      label: v.string(),
      stock: v.pipe(v.number(), v.integer()),
    }),
  ),
  topProducts: v.array(v.object({ productId: count, name: v.string(), units: count, cents })),
  pageViews: v.object({ week: count, month: count }),
  addToCart: v.object({ week: count, month: count }),
});
export type Dashboard = v.InferOutput<typeof DashboardSchema>;

/** Units at or below which a SKU counts as low stock on the dashboard. */
export const LOW_STOCK_THRESHOLD = 5;

/** "Size: M · Color: Navy", or "" for a single-SKU product. */
export const optionsLabel = (options: Readonly<Record<string, string>>): string =>
  Object.entries(options)
    .map(([name, value]) => `${name}: ${value}`)
    .join(' · ');

/** Start of the UTC day containing `now`, and the starts of the 7- and 30-day windows. */
export function salesWindows(now: Date): { today: Date; week: Date; month: Date } {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysAgo = (n: number) => new Date(day.getTime() - n * 86_400_000);
  return { today: day, week: daysAgo(6), month: daysAgo(29) };
}

// ── Products (docs/product-specs/admin.md, "Products" and "Inventory") ──

/** "12", "12.5", "12.50", "$1,299.00" → cents; undefined for anything else. */
export function parseDollars(text: string): number | undefined {
  const match = /^\$?(\d{1,7}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (match === null) return undefined;
  const whole = Number((match[1] ?? '').replaceAll(',', ''));
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const cents = whole * 100 + fraction;
  return Number.isSafeInteger(cents) ? cents : undefined;
}

/** Cents as an editable dollar string: 129900 → "1299.00". */
export const dollarsText = (cents: number): string => (cents / 100).toFixed(2);

/** "Size=M; Color=Navy" → { Size: 'M', Color: 'Navy' }; undefined when malformed. */
export function parseOptions(text: string): Readonly<Record<string, string>> | undefined {
  const pairs = text
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const entries: [string, string][] = [];
  for (const pair of pairs) {
    const [name, value, ...rest] = pair.split('=').map((s) => s.trim());
    if (name === undefined || value === undefined || rest.length > 0) return undefined;
    if (name === '' || value === '') return undefined;
    if (entries.some(([n]) => n === name)) return undefined;
    entries.push([name, value]);
  }
  return Object.fromEntries(entries);
}

/** The editable text for options: { Size: 'M' } → "Size=M". */
export const optionsText = (options: Readonly<Record<string, string>>): string =>
  Object.entries(options)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

/** One image per line: "https://…/a.jpg | Alt text" (alt optional, defaults to the name). */
export function parseImages(
  text: string,
  fallbackAlt: string,
): readonly { readonly url: string; readonly alt: string }[] | undefined {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const images: { url: string; alt: string }[] = [];
  for (const line of lines) {
    const [url = '', ...alt] = line.split('|').map((s) => s.trim());
    if (!/^(https?:\/\/|\/)\S+$/.test(url)) return undefined;
    images.push({ url, alt: alt.join(' | ') || fallbackAlt });
  }
  return images;
}

export const imagesText = (images: readonly { readonly url: string; readonly alt: string }[]) =>
  images.map((image) => `${image.url} | ${image.alt}`).join('\n');

export const PRODUCT_SORTS = ['name', 'price', 'stock', 'newest'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];
export const PRODUCTS_PER_PAGE = 25;

const ProductListRow = v.object({
  id: count,
  slug: v.string(),
  name: v.string(),
  brand: v.string(),
  department: v.string(),
  category: v.string(),
  priceCents: cents,
  salePriceCents: v.nullable(cents),
  stock: v.pipe(v.number(), v.integer()),
  variants: count,
  archived: v.boolean(),
});

export const ProductListSchema = v.object({
  rows: v.array(ProductListRow),
  page: count,
  pages: count,
  total: count,
});
export type ProductList = v.InferOutput<typeof ProductListSchema>;

const Named = v.object({ id: count, name: v.string() });

export const TaxonomySchema = v.object({
  departments: v.array(Named),
  categories: v.array(v.object({ id: count, departmentId: count, name: v.string() })),
  brands: v.array(Named),
});
export type Taxonomy = v.InferOutput<typeof TaxonomySchema>;

export const ProductEditSchema = v.object({
  product: v.object({
    id: count,
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    departmentId: count,
    categoryId: count,
    brandId: count,
    priceCents: cents,
    salePriceCents: v.nullable(cents),
    archived: v.boolean(),
  }),
  images: v.array(v.object({ url: v.string(), alt: v.string() })),
  variants: v.array(
    v.object({
      id: count,
      sku: v.string(),
      options: v.record(v.string(), v.string()),
      priceCents: v.nullable(cents),
      stock: v.pipe(v.number(), v.integer()),
    }),
  ),
  log: v.array(
    v.object({
      sku: v.string(),
      delta: v.pipe(v.number(), v.integer()),
      reason: v.string(),
      at: isoDate,
    }),
  ),
  taxonomy: TaxonomySchema,
});
export type ProductEdit = v.InferOutput<typeof ProductEditSchema>;

/** The admin API's answer to a successful save. */
export const SavedSchema = v.object({ _tag: v.literal('Saved'), id: count });
export const AdjustedSchema = v.object({
  _tag: v.literal('Adjusted'),
  stock: v.pipe(v.number(), v.integer()),
});

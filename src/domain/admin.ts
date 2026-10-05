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

// The admin dashboard (docs/product-specs/admin.md). Admins only: checked here as well as by
// the route guard (docs/design-docs/0002-security.md).
import {
  eventCount,
  lowStock,
  ordersByStatus,
  salesSince,
  topProducts,
} from '../db/repos/admin-dashboard.js';
import type { Db } from '../db/client.js';
import {
  LOW_STOCK_THRESHOLD,
  optionsLabel,
  salesWindows,
  type Dashboard,
} from '../domain/admin.js';
import { err, ok, type Result } from '../domain/result.js';
import { requireRole, type Actor, type AuthzError } from './authz.js';

export async function adminDashboard(
  db: Db,
  actor: Actor,
  now: Date,
): Promise<Result<Dashboard, AuthzError>> {
  const allowed = requireRole(actor, 'admin');
  if (!allowed.ok) return err(allowed.error);
  const windows = salesWindows(now);
  const [today, week, month, byStatus, low, top, viewsWeek, viewsMonth, cartWeek, cartMonth] =
    await Promise.all([
      salesSince(db, windows.today),
      salesSince(db, windows.week),
      salesSince(db, windows.month),
      ordersByStatus(db),
      lowStock(db, LOW_STOCK_THRESHOLD, 10),
      topProducts(db, windows.month, 5),
      eventCount(db, 'page_view', windows.week),
      eventCount(db, 'page_view', windows.month),
      eventCount(db, 'add_to_cart', windows.week),
      eventCount(db, 'add_to_cart', windows.month),
    ]);
  return ok({
    asOf: now.toISOString(),
    sales: { today, week, month },
    byStatus,
    lowStock: low.map(({ options, ...row }) => ({ ...row, label: optionsLabel(options) })),
    topProducts: top,
    pageViews: { week: viewsWeek, month: viewsMonth },
    addToCart: { week: cartWeek, month: cartMonth },
  });
}

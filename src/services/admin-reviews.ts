// Admin review moderation (docs/product-specs/admin.md, "Reviews"). Admins only. Hiding a review
// takes it off the product page and out of the product's rating (setReviewHidden recomputes).
import { adminReviewRows, countAdminReviews, productRating } from '../db/repos/admin-reviews.js';
import { setReviewHidden } from '../db/repos/reviews.js';
import type { Db } from '../db/client.js';
import {
  ADMIN_PAGE_SIZE,
  type AdminReviewList,
  type ReviewFilter,
} from '../domain/admin-manage.js';
import { err, ok, type Result } from '../domain/result.js';
import type { AdminError } from './admin-products.js';
import { requireRole, type Actor } from './authz.js';

export async function adminReviews(
  db: Db,
  actor: Actor,
  query: { readonly q: string; readonly filter: ReviewFilter; readonly page: number },
): Promise<Result<AdminReviewList, AdminError>> {
  const allowed = requireRole(actor, 'admin');
  if (!allowed.ok) return err(allowed.error);
  const total = await countAdminReviews(db, query.q, query.filter);
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  if (query.page > pages) return err({ _tag: 'NotFound' });
  const rows = await adminReviewRows(db, query.q, query.filter, {
    limit: ADMIN_PAGE_SIZE,
    offset: (query.page - 1) * ADMIN_PAGE_SIZE,
  });
  return ok({
    rows: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    page: query.page,
    pages,
    total,
  });
}

export async function moderateReview(
  db: Db,
  actor: Actor,
  reviewId: number,
  hidden: boolean,
): Promise<
  Result<
    {
      readonly id: number;
      readonly hidden: boolean;
      readonly rating: { readonly sum: number; readonly count: number };
    },
    AdminError
  >
> {
  const allowed = requireRole(actor, 'admin');
  if (!allowed.ok) return err(allowed.error);
  if (!(await setReviewHidden(db, reviewId, hidden))) return err({ _tag: 'NotFound' });
  const rating = (await productRating(db, reviewId)) ?? { sum: 0, count: 0 };
  return ok({ id: reviewId, hidden, rating });
}

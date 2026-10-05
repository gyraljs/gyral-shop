// Admin API for promo codes, users and review moderation (docs/product-specs/admin.md).
// Admins only. Writes are Gyral formActions over the same schemas the browser validates with;
// rejections are answered as 422 IntentRejected JSON (the admin requires JavaScript).
import { Hono, type Context } from 'hono';
import { formAction } from '@gyral/ssr';
import * as v from 'valibot';
import { REVIEW_FILTERS } from '../../domain/admin-manage.js';
import type { Services } from '../../services/container.js';
import {
  adminPromos,
  deletePromo,
  editablePromo,
  savePromo,
  type DayStart,
} from '../../services/admin-promos.js';
import { adminReviews, moderateReview } from '../../services/admin-reviews.js';
import { adminUsers, changeUser } from '../../services/admin-users.js';
import {
  PromoDeleteForm,
  PromoForm,
  ReviewVisibilityForm,
  UserActionForm,
} from '../../ui/admin/manage-schemas.js';
import { requireAdmin, type AppEnv } from '../security/index.js';
import { adminFailure, answer, asJson, NO_STORE, pageParam, positiveId } from './admin-http.js';

type C = Context<AppEnv>;

const SearchQuery = v.object({
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ''),
  filter: v.optional(v.picklist(REVIEW_FILTERS), 'all'),
});

const searchOf = (c: C) => {
  const parsed = v.safeParse(SearchQuery, c.req.query());
  return parsed.success ? parsed.output : { q: '', filter: 'all' as const };
};

export interface AdminManageOptions {
  readonly services: Services;
  /** How promo form dates become instants (the store's time zone). */
  readonly dayStart?: DayStart;
}

export function adminManageRoutes({ services, dayStart }: AdminManageOptions): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const { db } = services;
  routes.use('/api/admin/*', requireAdmin());
  const notFound = (c: C) => adminFailure(c, { _tag: 'NotFound' });

  // ── Promo codes ──
  routes.get('/api/admin/promos', async (c) => {
    const result = await adminPromos(db, c.get('user'), services.now());
    return result.ok ? c.json(result.value, 200, NO_STORE) : adminFailure(c, result.error);
  });

  const promoForm = async (c: C, id: number | undefined) => {
    const result = await editablePromo(db, c.get('user'), id, services.now());
    return result.ok ? c.json(result.value, 200, NO_STORE) : adminFailure(c, result.error);
  };
  routes.get('/api/admin/promos/new', (c) => promoForm(c, undefined));
  routes.get('/api/admin/promos/:id', (c) => {
    const id = positiveId(c.req.param('id'));
    return id === undefined ? notFound(c) : promoForm(c, id);
  });

  const save = (c: C, id: number | undefined) =>
    formAction(PromoForm, {
      intent: 'SavePromo',
      valid: async (data) =>
        answer(c, await savePromo(db, c.get('user'), id, data, dayStart), (r) => ({
          _tag: 'Saved',
          id: r.id,
        })),
      invalid: asJson,
    })(c.req.raw);
  routes.post('/api/admin/promos', (c) => save(c, undefined));
  routes.post('/api/admin/promos/:id', (c) => {
    const id = positiveId(c.req.param('id'));
    return id === undefined ? notFound(c) : save(c, id);
  });
  routes.post('/api/admin/promos/:id/delete', (c) => {
    const id = positiveId(c.req.param('id'));
    if (id === undefined) return notFound(c);
    return formAction(PromoDeleteForm, {
      intent: 'DeletePromo',
      valid: async () =>
        answer(c, await deletePromo(db, c.get('user'), id), (r) => ({ _tag: 'Deleted', id: r.id })),
      invalid: asJson,
    })(c.req.raw);
  });

  // ── Users ──
  routes.get('/api/admin/users', async (c) => {
    const result = await adminUsers(db, c.get('user'), {
      q: searchOf(c).q,
      page: pageParam(c.req.query('page')),
    });
    return result.ok ? c.json(result.value, 200, NO_STORE) : adminFailure(c, result.error);
  });
  routes.post('/api/admin/users/:id', (c) => {
    const id = positiveId(c.req.param('id'));
    if (id === undefined) return notFound(c);
    return formAction(UserActionForm, {
      intent: 'UserAction',
      valid: async (data) =>
        data.userId !== id
          ? notFound(c)
          : answer(c, await changeUser(db, c.get('user'), id, data.action), (r) => ({
              _tag: 'UserUpdated',
              ...r,
            })),
      invalid: asJson,
    })(c.req.raw);
  });

  // ── Reviews ──
  routes.get('/api/admin/reviews', async (c) => {
    const result = await adminReviews(db, c.get('user'), {
      ...searchOf(c),
      page: pageParam(c.req.query('page')),
    });
    return result.ok ? c.json(result.value, 200, NO_STORE) : adminFailure(c, result.error);
  });
  routes.post('/api/admin/reviews/:id/visibility', (c) => {
    const id = positiveId(c.req.param('id'));
    if (id === undefined) return notFound(c);
    return formAction(ReviewVisibilityForm, {
      intent: 'Moderate',
      valid: async (data) =>
        data.reviewId !== id
          ? notFound(c)
          : answer(c, await moderateReview(db, c.get('user'), id, data.hidden === 'yes'), (r) => ({
              _tag: 'ReviewModerated',
              ...r,
            })),
      invalid: asJson,
    })(c.req.raw);
  });

  return routes;
}

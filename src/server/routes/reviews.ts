// Review routes (docs/product-specs/wishlist-reviews.md). Mounted by app.ts.
// - GET  /p/:slug/reviews        every review, sorted and paged (links work without JS)
// - GET  /api/reviews/:slug      the same view model as JSON (<shop-reviews> loads in place)
// - GET  /p/:slug/review         the write-a-review page (members; verified purchasers write)
// - POST /p/:slug/review         formAction: no-JS 303/422, submitForm JSON 200/422
// - POST /reviews/:id/helpful    one vote per member: no-JS 303 + flash, JSON 200/4xx
import { Hono, type Context } from 'hono';
import { formAction, rejectWith, seeOther } from '@gyral/ssr';
import type { IntentRejected } from '@gyral/core';
import {
  DEFAULT_REVIEW_SORT,
  isReviewSort,
  parseReviewPage,
  voteRefusalMessage,
  type ReviewSort,
} from '../../domain/reviews.js';
import type { Db } from '../../db/client.js';
import { findProduct } from '../../db/repos/product.js';
import { reviewProductSlug } from '../../db/repos/reviews.js';
import {
  markHelpful,
  reviewsView,
  submitRefusalMessage,
  submitReview,
  type ReviewsView,
} from '../../services/reviews.js';
import { reviewsHref, reviewsPath } from '../../ui/product/reviews-model.js';
import { ReviewForm } from '../../ui/product/review-form.js';
import { reviewsPage, writeReviewPage } from '../../ui/pages/reviews.js';
import type { RenderPage } from '../document.js';
import { setFlash, takeFlash } from '../flash.js';
import { csrfTokenFor, requireUser, wantsJson, type AppEnv } from '../security/index.js';

export interface ReviewRouteOptions {
  readonly db: Db;
  readonly render: RenderPage;
}

type C = Context<AppEnv>;

/** `?sort=&page=`, or undefined when either is malformed. */
function reviewQuery(c: C): { sort: ReviewSort; page: number } | undefined {
  const sort = c.req.query('sort') ?? DEFAULT_REVIEW_SORT;
  const page = parseReviewPage(c.req.query('page'));
  return isReviewSort(sort) && page !== undefined ? { sort, page } : undefined;
}

const viewerOf = (c: C) => c.get('user')?.id;

/** Review snippets for the product's structured data: exactly the reviews the page shows. */
export const reviewJsonLd = (view: ReviewsView) =>
  view.items.map((r) => ({
    '@type': 'Review',
    name: r.title,
    reviewBody: r.body,
    datePublished: r.date,
    author: { '@type': 'Person', name: r.author },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: String(r.rating),
      bestRating: '5',
      worstRating: '1',
    },
  }));

/** The product page's reviews section: first page, most helpful first. */
export const productReviews = (db: Db, slug: string, c: C) => {
  const viewerId = viewerOf(c);
  return reviewsView(db, slug, {
    sort: DEFAULT_REVIEW_SORT,
    page: 1,
    ...(viewerId === undefined ? {} : { viewerId }),
  });
};

export function reviewRoutes({ db, render }: ReviewRouteOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  const load = async (c: C, query: { sort: ReviewSort; page: number }) => {
    const viewerId = viewerOf(c);
    return reviewsView(db, c.req.param('slug') ?? '', {
      ...query,
      ...(viewerId === undefined ? {} : { viewerId }),
    });
  };

  app.get('/p/:slug/reviews', async (c) => {
    const slug = c.req.param('slug');
    const query = reviewQuery(c);
    const base = reviewsPath(slug);
    if (query === undefined) return c.redirect(base, 301);
    const canonicalPath = reviewsHref(base, query.sort, query.page);
    // One spelling per state: `?sort=helpful&page=1` → the bare path.
    if (`${c.req.path}${new URL(c.req.url).search}` !== canonicalPath) {
      return c.redirect(canonicalPath, 301);
    }
    const [view, detail] = await Promise.all([load(c, query), findProduct(db, slug)]);
    if (view === undefined || detail === undefined) return c.notFound();
    if (query.page > view.pages) return c.notFound();
    const flash = takeFlash(c);
    const { origin } = new URL(c.req.url);
    const csrfToken = c.get('session')?.csrfToken;
    return render({
      title: `Reviews of ${view.productName}${query.page > 1 ? ` (page ${String(query.page)})` : ''}`,
      description: `What customers say about ${view.productName}.`,
      // The newest-first ordering repeats the same reviews: keep it out of the index.
      canonical: new URL(query.sort === DEFAULT_REVIEW_SORT ? canonicalPath : base, origin).href,
      noindex: query.sort !== DEFAULT_REVIEW_SORT,
      currentDepartment: detail.product.department.slug,
      main: reviewsPage(view, detail.product, {
        ...(csrfToken === undefined ? {} : { csrfToken }),
        ...(flash === undefined ? {} : { notice: flash }),
      }),
    });
  });

  app.get('/api/reviews/:slug', async (c) => {
    const query = reviewQuery(c);
    if (query === undefined) return c.json({ message: 'Bad sort or page.' }, 400);
    const view = await load(c, query);
    if (view === undefined || query.page > view.pages)
      return c.json({ message: 'Not found.' }, 404);
    return c.json(view, 200, { 'cache-control': 'no-store' });
  });

  const writePage = async (c: C, rejected?: IntentRejected, status = 200) => {
    const slug = c.req.param('slug') ?? '';
    const [view, detail] = await Promise.all([
      load(c, { sort: DEFAULT_REVIEW_SORT, page: 1 }),
      findProduct(db, slug),
    ]);
    if (view === undefined || detail === undefined) return c.notFound();
    const response = await render({
      title: `Review ${view.productName}`,
      noindex: true,
      status,
      currentDepartment: detail.product.department.slug,
      main: writeReviewPage(view, detail.product, await csrfTokenFor(c), rejected),
    });
    response.headers.set('cache-control', 'no-store');
    return response;
  };

  app.get('/p/:slug/review', requireUser(), (c) => writePage(c));

  app.post('/p/:slug/review', requireUser(), async (c) => {
    const slug = c.req.param('slug');
    const user = c.get('user');
    if (user === undefined) return c.notFound(); // requireUser() guarantees a member
    return formAction(ReviewForm, {
      intent: 'Submit',
      valid: async (data) => {
        const created = await submitReview(db, slug, user.id, data);
        if (!created.ok)
          return rejectWith([{ path: '', message: submitRefusalMessage(created.error) }]);
        setFlash(c, { kind: 'success', message: 'Thanks, your review is posted.' });
        return seeOther(
          `${reviewsHref(reviewsPath(slug), 'newest', 1)}#review-${String(created.value.id)}`,
        );
      },
      invalid: (r) => writePage(c, r, 422),
    })(c.req.raw);
  });

  app.post('/reviews/:id/helpful', requireUser(), async (c) => {
    const id = Number(c.req.param('id'));
    const user = c.get('user');
    if (!Number.isSafeInteger(id) || id <= 0 || user === undefined) return c.notFound();
    const voted = await markHelpful(db, id, user.id);
    if (wantsJson(c)) {
      return voted.ok
        ? c.json(voted.value)
        : c.json(
            { message: voteRefusalMessage(voted.error) },
            voted.error === 'NotFound' ? 404 : 409,
          );
    }
    const slug = await reviewProductSlug(db, id);
    if (slug === undefined) return c.notFound();
    setFlash(
      c,
      voted.ok
        ? { kind: 'success', message: 'Thanks, your vote was counted.' }
        : { kind: 'error', message: voteRefusalMessage(voted.error) },
    );
    // Back to where the vote was cast when that was one of this product's pages.
    const back = sameProductPage(c.req.header('referer'), c.req.url, slug);
    return seeOther(`${back ?? reviewsPath(slug)}#review-${String(id)}`);
  });

  return app;
}

/** The referring path when it is this product's page or reviews page on this origin. */
function sameProductPage(referer: string | undefined, current: string, slug: string) {
  if (referer === undefined) return undefined;
  try {
    const url = new URL(referer);
    if (url.origin !== new URL(current).origin) return undefined;
    const ok = url.pathname === `/p/${slug}` || url.pathname === reviewsPath(slug);
    return ok ? `${url.pathname}${url.search}` : undefined;
  } catch {
    return undefined;
  }
}

// <shop-admin-reviews>: review moderation (docs/product-specs/admin.md, "Reviews"). Hiding a
// review removes it from the product page and the product's rating; showing it restores both.
import { define, fieldErrors, form, html, nothing, prop, type Next } from '@gyral/core';
import { get, submitForm, type HttpError } from '@gyral/http';
import { navigate } from '@gyral/router';
import * as v from 'valibot';
import {
  AdminReviewListSchema,
  REVIEW_FILTERS,
  ReviewModeratedSchema,
  type AdminReviewList,
  type ReviewFilter,
} from '../../domain/admin-manage.js';
import { adminDrivers } from './drivers.js';
import { formError, type Errors } from './fields.js';
import { dateTime, loadError } from './format.js';
import { ListFilterForm, ReviewVisibilityForm } from './manage-schemas.js';
import { pager } from './table.js';

export interface ReviewsProps {
  readonly search: string;
}

export interface ReviewsState {
  readonly search: string;
  readonly list: AdminReviewList | null;
  readonly error: string | null;
  readonly notice: string | null;
  readonly errors: Errors;
  readonly pending: number | null;
}

export type ReviewsMsg =
  | { readonly _tag: 'Search'; readonly q: string; readonly filter: ReviewFilter }
  | { readonly _tag: 'Moderate'; readonly reviewId: number; readonly form: FormData }
  | { readonly _tag: 'Moderated'; readonly id: number; readonly hidden: boolean }
  | { readonly _tag: 'Loaded'; readonly search: string; readonly list: AdminReviewList }
  | { readonly _tag: 'Failed'; readonly error: HttpError };

interface Query {
  readonly q: string;
  readonly filter: ReviewFilter;
  readonly page: number;
}

export function reviewsQuery(search: string): Query {
  const p = new URLSearchParams(search);
  const page = Number(p.get('page') ?? '1');
  return {
    q: (p.get('q') ?? '').trim(),
    filter: REVIEW_FILTERS.find((f) => f === p.get('filter')) ?? 'all',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function reviewsHref(query: Query): string {
  const p = new URLSearchParams();
  if (query.q !== '') p.set('q', query.q);
  if (query.filter !== 'all') p.set('filter', query.filter);
  if (query.page > 1) p.set('page', String(query.page));
  const text = p.toString();
  return text === '' ? '/admin/reviews' : `/admin/reviews?${text}`;
}

const load = (search: string) => {
  const q = reviewsQuery(search);
  const params = new URLSearchParams({ q: q.q, filter: q.filter, page: String(q.page) });
  return get(`/api/admin/reviews?${params.toString()}`, {
    schema: AdminReviewListSchema,
    onSuccess: (list): ReviewsMsg => ({ _tag: 'Loaded', search, list }),
    onFailure: (error): ReviewsMsg => ({ _tag: 'Failed', error }),
    key: 'admin-reviews',
    concurrency: 'switch',
  });
};

function moderate(s: ReviewsState, id: number, data: FormData): Next<ReviewsState, ReviewsMsg> {
  return [
    { ...s, pending: id, errors: {}, notice: null },
    [
      submitForm(`/api/admin/reviews/${String(id)}/visibility`, data, {
        onSuccess: (body): ReviewsMsg | undefined => {
          const done = v.safeParse(ReviewModeratedSchema, body);
          return done.success
            ? { _tag: 'Moderated', id: done.output.id, hidden: done.output.hidden }
            : undefined;
        },
        onFailure: (error): ReviewsMsg => ({ _tag: 'Failed', error }),
        key: 'admin-review-moderate',
      }),
    ],
  ];
}

const stars = (n: number) => `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;

function card(r: AdminReviewList['rows'][number], s: ReviewsState, i: { Moderate: string }) {
  return html`<article
    class="admin-review"
    data-component="admin-review"
    data-hidden=${r.hidden ? 'yes' : 'no'}
    aria-labelledby=${`r${String(r.id)}-title`}
  >
    <h2 id=${`r${String(r.id)}-title`}>${r.title}</h2>
    <p>
      <span aria-label=${`${String(r.rating)} out of 5 stars`}>${stars(r.rating)}</span>
      · <a href=${`/p/${r.slug}`}>${r.product}</a> · by ${r.author} ·
      <time datetime=${r.createdAt}>${dateTime.format(new Date(r.createdAt))}</time>
      · ${r.helpful} found helpful
    </p>
    <p>${r.body}</p>
    <form class="admin-actions" data-intent=${i.Moderate} data-component="review-moderation">
      <input type="hidden" name="reviewId" value=${String(r.id)} />
      <input type="hidden" name="hidden" value=${r.hidden ? 'no' : 'yes'} />
      <p>${r.hidden ? 'Hidden from shoppers.' : 'Visible to shoppers.'}</p>
      <button
        type="submit"
        data-variant=${r.hidden ? 'quiet' : 'danger'}
        ?disabled=${s.pending === r.id}
      >
        ${r.hidden ? 'Show review' : 'Hide review'}<span class="visually-hidden">: ${r.title}</span>
      </button>
    </form>
  </article>`;
}

export const AdminReviews = define<ReviewsState, ReviewsMsg, ReviewsProps>()('shop-admin-reviews', {
  shadow: false,
  props: { search: prop.string({ default: '' }) },
  init: (props) => [
    { search: props.search, list: null, error: null, notice: null, errors: {}, pending: null },
    [load(props.search)],
  ],
  intent: {
    Search: form(ListFilterForm, (data) => ({ _tag: 'Search', q: data.q, filter: data.filter })),
    Moderate: form(ReviewVisibilityForm, (data, raw) => ({
      _tag: 'Moderate',
      reviewId: data.reviewId,
      form: raw,
    })),
  },
  update: {
    Search: (s, m) => [s, [navigate(reviewsHref({ q: m.q, filter: m.filter, page: 1 }))]],
    Moderate: (s, m) => moderate(s, m.reviewId, m.form),
    Moderated: (s, m) => [
      {
        ...s,
        pending: null,
        notice: m.hidden
          ? 'Review hidden. The product’s rating no longer counts it.'
          : 'Review shown again.',
      },
      [load(s.search)],
    ],
    Loaded: (s, m) => (m.search === s.search ? { ...s, list: m.list, error: null } : s),
    Failed: (s, m) => ({ ...s, pending: null, error: loadError(m.error) }),
    IntentRejected: (s, m) => ({ ...s, pending: null, errors: fieldErrors(m.issues) }),
    PropsChanged: (s, m) =>
      m.props.search === s.search ? s : [{ ...s, search: m.props.search }, [load(m.props.search)]],
  },
  drivers: adminDrivers,
  view: (s, i) => {
    const q = reviewsQuery(s.search);
    return html`<section class="admin-page" data-region="admin-reviews">
      <h1 tabindex="-1">Reviews</h1>
      <form
        class="admin-toolbar"
        data-intent=${i.Search}
        role="search"
        data-component="review-search"
      >
        <label>Search product or title <input type="search" name="q" value=${q.q} /></label>
        <label
          >Show
          <select name="filter">
            <option value="all" ?selected=${q.filter === 'all'}>All reviews</option>
            <option value="visible" ?selected=${q.filter === 'visible'}>Visible</option>
            <option value="hidden" ?selected=${q.filter === 'hidden'}>Hidden</option>
          </select>
        </label>
        <button type="submit">Search</button>
      </form>
      ${s.error === null ? nothing : html`<p role="alert" data-component="notice" data-kind="error">${s.error}</p>`}
      ${formError(s.errors)}
      <p role="status" data-component="notice" data-kind="success" ?hidden=${s.notice === null}>
        ${s.notice}
      </p>
      ${
        s.list === null
          ? s.error === null
            ? html`<p role="status" data-component="loading">Loading…</p>`
            : nothing
          : html`<p data-component="result-count">
                ${s.list.total} ${s.list.total === 1 ? 'review' : 'reviews'}
              </p>
              ${s.list.rows.length === 0 ? html`<p data-component="empty">No reviews match.</p>` : s.list.rows.map((r) => card(r, s, i))}
              ${pager(s.list.page, s.list.pages, (page) => reviewsHref({ ...q, page }))}`
      }
    </section>`;
  },
});

declare global {
  interface HTMLElementTagNameMap {
    'shop-admin-reviews': InstanceType<typeof AdminReviews>;
  }
}

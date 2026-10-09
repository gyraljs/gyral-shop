// Markup for the reviews section (light DOM, theme contract ADR 0006: data-region="reviews"
// and data-component hooks). Every control is a link or a POST form, so the section works
// without JavaScript; <shop-reviews> (./reviews.ts) enhances links and vote forms in place.
import { html, nothing, type IntentNames } from '@gyral/core';
import { eligibilityMessage, REVIEW_SORTS, type ReviewSort } from '../../domain/reviews.js';
import { ratingStep } from '../catalog/rating.js';
import { CSRF_FIELD } from '../forms/csrf.js';
import {
  helpfulPath,
  plural,
  reviewsHref,
  writeReviewPath,
  type ReviewItemData,
  type ReviewsViewData,
} from './reviews-model.js';

export interface Notice {
  readonly kind: 'success' | 'error';
  readonly message: string;
}

/** The parts of the component's state and props the view needs. */
export interface ReviewsRender {
  readonly view: ReviewsViewData;
  readonly loading: boolean;
  readonly notice: Notice | undefined;
  /** Reviews whose vote is in flight. */
  readonly voting: readonly number[];
  readonly csrfToken: string | undefined;
  /** Where sort and page links point (the product page section links to the reviews page). */
  readonly listPath: string;
  /** Heading level of the section title: 2 on the product page, 1 on the reviews page. */
  readonly standalone: boolean;
}

type Intents = IntentNames<'Load' | 'Vote'>;

const SORT_LABELS: Record<ReviewSort, string> = { helpful: 'Most helpful', newest: 'Newest' };

export const stars = (rating: number, label: string) => html`
  <span class="rating" data-component="rating">
    <span class="stars" aria-hidden="true" data-rating=${ratingStep(rating)}></span>
    <span class="visually-hidden">${label}</span>
  </span>
`;

const summary = (view: ReviewsViewData) =>
  view.summary.average === null
    ? html`<p data-component="rating-summary">No one has reviewed this product yet.</p>`
    : html`<div class="reviews-summary" data-component="rating-summary">
        <p class="average">
          <span class="big">${view.summary.average.toFixed(1)}</span>
          ${stars(view.summary.average, 'out of 5 stars')}
          <span>${plural(view.summary.count, 'review')}</span>
        </p>
        <dl class="distribution" data-component="rating-distribution">
          ${view.summary.distribution.map(
            (row) =>
              html`<div>
                <dt>${plural(row.stars, 'star')}</dt>
                <dd>
                  <meter
                    min="0"
                    max=${Math.max(1, view.summary.count)}
                    value=${row.count}
                    aria-label=${`${plural(row.stars, 'star')}: ${plural(row.count, 'review')}`}
                  ></meter>
                  <span class="count">${row.count}</span>
                </dd>
              </div>`,
          )}
        </dl>
      </div>`;

const callToAction = (view: ReviewsViewData) => {
  const write = writeReviewPath(view.slug);
  switch (view.eligibility._tag) {
    case 'CanReview':
      return html`<a class="button" href=${write}>Write a review</a>`;
    case 'SignIn':
      return html`<a href=${`/account/login?next=${encodeURIComponent(write)}`}
        >Sign in to write a review</a
      >`;
    case 'AlreadyReviewed':
    case 'NotPurchased':
      return eligibilityMessage(view.eligibility);
  }
};

function helpful(r: ReviewItemData, s: ReviewsRender, i: Intents) {
  const count =
    r.helpfulCount === 0
      ? nothing
      : html`<span>${plural(r.helpfulCount, 'person')} found this helpful</span>`;
  const canVote = s.view.eligibility._tag !== 'SignIn' && !r.own && !r.voted;
  return html`<footer data-component="review-helpful">
    ${count}
    ${
      canVote
        ? html`<form method="post" action=${helpfulPath(r.id)} data-intent=${i.Vote}>
            <input type="hidden" name=${CSRF_FIELD} value=${s.csrfToken ?? ''} />
            <input type="hidden" name="reviewId" value=${r.id} />
            <button class="link-button" ?disabled=${s.voting.includes(r.id)}>Helpful</button>
          </form>`
        : r.voted
          ? html`<span>You found this helpful</span>`
          : nothing
    }
  </footer>`;
}

const review = (r: ReviewItemData, s: ReviewsRender, i: Intents) => html`
  <li>
    <article
      id=${`review-${String(r.id)}`}
      data-component="review"
      aria-labelledby=${`review-title-${String(r.id)}`}
    >
      <h3 id=${`review-title-${String(r.id)}`}>${r.title}</h3>
      ${stars(r.rating, `${String(r.rating)} out of 5 stars`)}
      <p class="byline">${r.author}, <time datetime=${r.date}>${r.date}</time></p>
      <p>${r.body}</p>
      ${helpful(r, s, i)}
    </article>
  </li>
`;

const sortNav = (s: ReviewsRender, i: Intents) => html`
  <nav aria-label="Sort reviews" data-component="review-sort">
    <ul>
      ${REVIEW_SORTS.map(
        (sort) =>
          html`<li>
            <a
              href=${reviewsHref(s.listPath, sort, 1)}
              aria-current=${sort === s.view.sort ? 'true' : nothing}
              data-intent=${i.Load}
              >${SORT_LABELS[sort]}</a
            >
          </li>`,
      )}
    </ul>
  </nav>
`;

function pager(s: ReviewsRender, i: Intents) {
  const { page, pages, sort } = s.view;
  if (pages <= 1) return nothing;
  const link = (n: number, label: string, rel: string) =>
    html`<a href=${reviewsHref(s.listPath, sort, n)} rel=${rel} data-intent=${i.Load}>${label}</a>`;
  return html`<nav aria-label="Review pages" data-component="pager" class="review-pager">
    ${page > 1 ? link(page - 1, 'Previous', 'prev') : nothing}
    <span>Page ${page} of ${pages}</span>
    ${page < pages ? link(page + 1, 'Next', 'next') : nothing}
  </nav>`;
}

export function reviewsSection(s: ReviewsRender, i: Intents) {
  const title = s.standalone
    ? html`<h1 id="reviews-title" tabindex="-1">Reviews of ${s.view.productName}</h1>`
    : html`<h2 id="reviews-title" tabindex="-1">Customer reviews</h2>`;
  return html`<section
    id="reviews"
    data-region="reviews"
    aria-labelledby="reviews-title"
    class="product-section reviews"
  >
    ${title} ${summary(s.view)}
    <p data-component="review-cta">${callToAction(s.view)}</p>
    <p data-component="review-notice" role="status" class=${s.notice?.kind}>
      ${s.notice === undefined ? nothing : s.notice.message}
    </p>
    ${
      s.view.total === 0
        ? nothing
        : html`${sortNav(s, i)}
            <ol data-component="review-list" aria-busy=${s.loading ? 'true' : 'false'}>
              ${s.view.items.map((r) => review(r, s, i))}
            </ol>
            ${pager(s, i)}
            ${
              s.standalone || s.view.total <= s.view.items.length
                ? nothing
                : html`<p>
                    <a href=${reviewsHref(s.listPath, s.view.sort, 1)}
                      >See all ${plural(s.view.total, 'review')}</a
                    >
                  </p>`
            }`
    }
  </section>`;
}

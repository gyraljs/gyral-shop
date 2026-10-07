// Review pages (docs/product-specs/wishlist-reviews.md): every review of a product, paged and
// sorted, and the write-a-review page for verified purchasers. Light DOM throughout.
import { html, type IntentRejected } from '@gyral/core';
import { eligibilityMessage } from '../../domain/reviews.js';
import { breadcrumbs, type Crumb } from '../catalog/breadcrumbs.js';
import { reviewsPath, writeReviewPath, type ReviewsViewData } from '../product/reviews-model.js';
import type { Notice } from '../product/reviews-view.js';
import '../product/reviews.js'; // registers <shop-reviews> for server rendering
import '../product/review-form.js'; // registers <shop-review-form>

export interface ReviewPageContext {
  readonly department: { readonly slug: string; readonly name: string };
  readonly category: { readonly slug: string; readonly name: string };
}

const crumbs = (view: ReviewsViewData, ctx: ReviewPageContext, last: string): Crumb[] => [
  { name: 'Home', path: '/' },
  { name: ctx.department.name, path: `/d/${ctx.department.slug}` },
  { name: ctx.category.name, path: `/c/${ctx.department.slug}/${ctx.category.slug}` },
  { name: view.productName, path: `/p/${view.slug}` },
  { name: last },
];

/** The reviews section element, shared by the product page and the reviews page. */
export const reviewsElement = (
  view: ReviewsViewData,
  options: { readonly csrfToken?: string; readonly notice?: Notice; readonly standalone?: boolean },
) =>
  html`<shop-reviews
    .view=${view}
    list-path=${reviewsPath(view.slug)}
    csrf-token=${options.csrfToken}
    .notice=${options.notice}
    ?standalone=${options.standalone === true}
  ></shop-reviews>`;

export const reviewsPage = (
  view: ReviewsViewData,
  ctx: ReviewPageContext,
  options: { readonly csrfToken?: string; readonly notice?: Notice },
) => html`
  ${breadcrumbs(crumbs(view, ctx, 'Reviews'))}
  <p><a href=${`/p/${view.slug}`}>Back to ${view.productName}</a></p>
  ${reviewsElement(view, { ...options, standalone: true })}
`;

export const writeReviewPage = (
  view: ReviewsViewData,
  ctx: ReviewPageContext,
  csrfToken: string,
  rejected?: IntentRejected,
) => html`
  ${breadcrumbs(crumbs(view, ctx, 'Write a review'))}
  <article class="prose" data-region="write-review" aria-labelledby="title">
    <header>
      <h1 id="title">Review ${view.productName}</h1>
      <p class="lead">${eligibilityMessage(view.eligibility)}</p>
    </header>
    ${
      view.eligibility._tag === 'CanReview'
        ? html`<shop-review-form
            csrf-token=${csrfToken}
            action=${writeReviewPath(view.slug)}
            .initialMessages=${rejected === undefined ? [] : [rejected]}
          ></shop-review-form>`
        : html`<p><a href=${`/p/${view.slug}#reviews`}>Back to ${view.productName}</a></p>`
    }
  </article>
`;

import { html, nothing } from '@gyral/core';
import { breadcrumbs, type Crumb } from '../catalog/breadcrumbs.js';
import { cardGrid, type ProductCard } from '../catalog/product-card.js';
import type { BuyBoxVariant } from '../product/buy-box.js';
import type { GalleryImage } from '../product/gallery.js';
import '../product/buy-box.js'; // registers <shop-buy-box> for server rendering
import '../wishlist/toggle.js'; // registers <shop-wish-toggle> for server rendering
import '../product/gallery.js'; // registers <shop-gallery> for server rendering
import type { ReviewsViewData } from '../product/reviews-model.js';
import type { Notice } from '../product/reviews-view.js';
import { reviewsElement } from './reviews.js';

/** What the page shows. Matches services/product.ts ProductPageData. */
export interface ProductView {
  readonly slug: string;
  readonly name: string;
  readonly brand: string;
  readonly description: string;
  readonly specs: readonly (readonly [string, string])[];
  readonly department: { readonly slug: string; readonly name: string };
  readonly category: { readonly slug: string; readonly name: string };
  readonly images: readonly GalleryImage[];
  readonly variants: readonly BuyBoxVariant[];
  readonly rating: {
    readonly average: number | null;
    readonly count: number;
    readonly distribution: readonly { readonly stars: number; readonly count: number }[];
  };
  readonly reviews: readonly {
    readonly id: number;
    readonly rating: number;
    readonly title: string;
    readonly body: string;
    readonly author: string;
    readonly date: string;
  }[];
  readonly related: readonly ProductCard[];
}

export const productPath = (slug: string): string => `/p/${slug}`;

export const productCrumbs = (view: ProductView): Crumb[] => [
  { name: 'Home', path: '/' },
  { name: view.department.name, path: `/d/${view.department.slug}` },
  { name: view.category.name, path: `/c/${view.department.slug}/${view.category.slug}` },
  { name: view.name },
];

const stars = (rating: number, label: string) => html`
  <span class="rating">
    <span class="stars" aria-hidden="true" style="--rating: ${rating}"></span>
    <span class="visually-hidden">${label}</span>
  </span>
`;

const plural = (n: number, word: string) => `${String(n)} ${word}${n === 1 ? '' : 's'}`;

const ratingSummary = (view: ProductView) =>
  view.rating.average === null
    ? html`<p class="rating-summary">No reviews yet</p>`
    : html`<p class="rating-summary">
        ${stars(view.rating.average, `Rated ${view.rating.average.toFixed(1)} out of 5`)}
        <span aria-hidden="true">${view.rating.average.toFixed(1)}</span>
        <a href="#reviews">${plural(view.rating.count, 'review')}</a>
      </p>`;

const specsTable = (specs: ProductView['specs']) =>
  specs.length === 0
    ? nothing
    : html`<section data-region="specs" aria-labelledby="specs-title" class="product-section">
        <h2 id="specs-title">Specifications</h2>
        <table class="specs">
          <tbody>
            ${specs.map(
              ([name, value]) =>
                html`<tr>
                  <th scope="row">${name}</th>
                  <td>${value}</td>
                </tr>`,
            )}
          </tbody>
        </table>
      </section>`;

export interface ProductPageOptions {
  readonly csrf?: string;
  readonly action?: string;
  /** The reviews section (first page); omitted, the page shows no reviews section. */
  readonly reviews?: ReviewsViewData;
  /** A flash message for the reviews section (after a no-JS helpful vote). */
  readonly notice?: Notice;
}

/** The product detail page: gallery, buy box, description, specs, reviews, related. */
export const productPage = (view: ProductView, options: ProductPageOptions = {}) => html`
  ${breadcrumbs(productCrumbs(view))}
  <div class="product" data-region="product">
    <shop-gallery
      class="product-gallery"
      data-region="gallery"
      .images=${view.images}
    ></shop-gallery>
    <div class="product-info" data-region="product-info">
      <p class="brand">${view.brand}</p>
      <h1>${view.name}</h1>
      ${ratingSummary(view)}
      <shop-buy-box
        data-region="buy-box"
        .variants=${view.variants}
        action=${options.action ?? nothing}
        csrf=${options.csrf ?? nothing}
      ></shop-buy-box>
      <shop-wish-toggle
        class="product-wish"
        slug=${view.slug}
        name=${view.name}
        next=${productPath(view.slug)}
      ></shop-wish-toggle>
    </div>
  </div>
  <section data-region="description" aria-labelledby="description-title" class="product-section">
    <h2 id="description-title">About this item</h2>
    <p>${view.description}</p>
  </section>
  ${specsTable(view.specs)}
  ${
    options.reviews === undefined
      ? nothing
      : reviewsElement(options.reviews, {
          ...(options.csrf === undefined ? {} : { csrfToken: options.csrf }),
          ...(options.notice === undefined ? {} : { notice: options.notice }),
        })
  }
  ${
    view.related.length === 0
      ? nothing
      : cardGrid('Customers also viewed', 'related-title', view.related)
  }
`;

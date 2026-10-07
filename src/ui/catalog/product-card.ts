import { html, nothing } from '@gyral/core';
import { format, usd } from '../../domain/money.js';
import { ratingStep } from './rating.js';
import '../wishlist/toggle.js'; // registers <shop-wish-toggle> for server rendering

/** What a product card shows. Matches the server's card data (services/catalog.ts). */
export interface ProductCard {
  readonly slug: string;
  readonly name: string;
  readonly brand: string;
  readonly priceCents: number;
  readonly salePriceCents: number | null;
  readonly rating: number | null;
  readonly ratingCount: number;
  readonly image: { readonly url: string; readonly alt: string } | null;
  readonly inStock: boolean;
}

const price = (card: ProductCard) =>
  card.salePriceCents === null
    ? html`<p class="price" data-component="price">${format(usd(card.priceCents))}</p>`
    : html`<p class="price sale" data-component="price">
        <ins
          ><span class="visually-hidden">Sale price </span>${format(usd(card.salePriceCents))}</ins
        >
        <del><span class="visually-hidden">Was </span>${format(usd(card.priceCents))}</del>
      </p>`;

const rating = (card: ProductCard) =>
  card.rating === null
    ? nothing
    : html`<p class="rating" data-component="rating" data-rating=${ratingStep(card.rating)}>
        <span class="stars" aria-hidden="true"></span>
        <span class="visually-hidden">Rated </span>${card.rating.toFixed(1)}<span
          class="visually-hidden"
        >
          out of 5</span
        >
        <span class="count"
          >(${card.ratingCount}<span class="visually-hidden"> reviews</span>)</span
        >
      </p>`;

export interface CardOptions {
  /** Show the "Save to wishlist" toggle (default true; the wishlist page has its own actions). */
  readonly wishlist?: boolean;
}

/** A product card: plain markup (no component), styled by the catalog stylesheet. */
export const productCard = (card: ProductCard, eager = false, options: CardOptions = {}) => html`
  <article class="product-card" data-component="product-card">
    <a href="/p/${card.slug}">
      ${
        card.image === null
          ? nothing
          : html`<img
              src=${card.image.url}
              alt=""
              width="400"
              height="400"
              loading=${eager ? 'eager' : 'lazy'}
              decoding="async"
            />`
      }
      <h3>${card.name}</h3>
    </a>
    <p class="brand">${card.brand}</p>
    ${price(card)} ${rating(card)}
    ${card.inStock ? nothing : html`<p class="stock out">Out of stock</p>`}
    ${
      options.wishlist === false
        ? nothing
        : html`<shop-wish-toggle slug=${card.slug} name=${card.name}></shop-wish-toggle>`
    }
  </article>
`;

/** A titled grid of cards. */
export const cardGrid = (
  heading: string,
  id: string,
  cards: readonly ProductCard[],
  eager = 0,
) => html`
  <section aria-labelledby=${id} class="card-section">
    <h2 id=${id}>${heading}</h2>
    <div class="card-grid" data-component="card-grid">
      ${cards.map((c, i) => productCard(c, i < eager))}
    </div>
  </section>
`;

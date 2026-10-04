import { html, nothing } from '@gyral/core';
import { format, usd } from '../../domain/money.js';

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
    ? html`<p class="price">${format(usd(card.priceCents))}</p>`
    : html`<p class="price sale">
        <ins
          ><span class="visually-hidden">Sale price </span>${format(usd(card.salePriceCents))}</ins
        >
        <del><span class="visually-hidden">Was </span>${format(usd(card.priceCents))}</del>
      </p>`;

const rating = (card: ProductCard) =>
  card.rating === null
    ? nothing
    : html`<p class="rating" style="--rating: ${card.rating}">
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

/** A product card: plain markup (no component), styled by the catalog stylesheet. */
export const productCard = (card: ProductCard, eager = false) => html`
  <article class="product-card">
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
    <div class="card-grid">${cards.map((c, i) => productCard(c, i < eager))}</div>
  </section>
`;

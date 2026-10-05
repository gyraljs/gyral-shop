// /account/wishlist (docs/product-specs/wishlist-reviews.md): the member's saved products with
// "Move to cart" and "Remove". Server-rendered light DOM; every action is a plain form post
// (Post/Redirect/Get with a flash message). Theme hooks: ADR 0006.
import { html } from '@gyral/core';
import { productCard, type ProductCard } from '../catalog/product-card.js';
import { csrfField } from '../forms/csrf.js';
import { frame, type Notice } from './account-settings.js';

export const WISHLIST_PATH = '/account/wishlist';

export interface WishlistPageData {
  readonly csrfToken: string;
  readonly items: readonly ProductCard[];
  readonly flash?: Notice;
}

const action = (path: string, csrf: string, slug: string, label: string, name: string, cls = '') =>
  html`<form method="post" action=${path} class=${cls}>
    ${csrfField(csrf)}
    <input type="hidden" name="product" value=${slug} />
    <input type="hidden" name="next" value=${WISHLIST_PATH} />
    <button type="submit">${label}<span class="visually-hidden"> ${name}</span></button>
  </form>`;

const items = (d: WishlistPageData) =>
  d.items.length === 0
    ? html`<p data-component="wishlist-empty">
        Your wishlist is empty. Press <strong>Save</strong> on any product to keep it here.
        <a href="/">Start shopping</a>
      </p>`
    : html`<h2 class="count">${d.items.length} saved ${d.items.length === 1 ? 'item' : 'items'}</h2>
        <ul class="wishlist" data-component="wishlist-items">
          ${d.items.map(
            (card) =>
              html`<li data-component="wishlist-item">
                ${productCard(card, false, { wishlist: false })}
                <div class="wishlist-actions" data-component="wishlist-actions">
                  ${action('/wishlist/move', d.csrfToken, card.slug, 'Move to cart', card.name, 'primary')}
                  ${action('/wishlist/remove', d.csrfToken, card.slug, 'Remove', card.name)}
                </div>
              </li>`,
          )}
        </ul>`;

export const wishlistPage = (d: WishlistPageData) =>
  html`<div data-region="wishlist">${frame('wishlist', 'Wishlist', items(d), d.flash)}</div>`;

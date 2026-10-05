# Wishlist and reviews

- **Wishlist** (members): add/remove from product cards and product pages; `/account/wishlist`
  with "move to cart".
- **Reviews**: members who purchased a product may leave one review (1–5 stars, title, body);
  shown on product pages with average, distribution histogram (`<meter>`s), sort by newest or
  most helpful, "helpful" votes (one per member), pagination.
- Admin can hide a review.

## Implementation notes (reviews, shop-7kz.2)

- Verified purchasers are members with a `paid`, `fulfilled`, `delivered` or
  `partially_refunded` order containing any variant of the product (`src/domain/reviews.ts`).
  One review per member per product (unique index; a hidden review still counts).
- Pages: the product page's section (first page, most helpful first), `/p/:slug/reviews`
  (sorted and paged; `?sort=newest` is `noindex` with a canonical to the default order), and
  `/p/:slug/review` (members). JSON: `/api/reviews/:slug?sort=&page=`.
- Every write (review, vote, hide) runs in a locked transaction and recomputes the product's
  `rating_sum`/`rating_count` from visible reviews, so cards, pages and structured data agree.
- `<shop-reviews>` is a `hydrate: 'visible'` island in light DOM: links and vote forms work as
  server HTML; once hydrated, sorting and paging load in place and votes post without a reload.
- Product structured data carries `review` snippets for exactly the reviews the page shows.
- Admin hiding (`setReviewHidden`) exists in the repository; its UI is the admin epic.

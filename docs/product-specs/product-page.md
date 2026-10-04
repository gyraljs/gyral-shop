# Product page

- URL `/p/:slug`. SSR with title, description, price (sale price with the original struck
  through), rating summary, breadcrumbs (department › category › product).
- Image gallery: main image + thumbnails, keyboard operable; `loading="lazy"` except the first.
- Variants (e.g. size, color) select a SKU; price and stock update per SKU; unavailable
  combinations are disabled with a reason.
- Quantity input (1..min(10, stock)) and **Add to cart** (a POST form without JS; with JS,
  updates the cart store and the mini-cart without navigation, with a status message).
- **Add to wishlist** (members; guests are sent to login and back).
- Specifications table, description, "customers also viewed" (same category).
- Reviews summary + first reviews (see wishlist-reviews.md).

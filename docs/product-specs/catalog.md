# Catalog

Departments: Electronics, Home & Kitchen, Clothing, Toys & Games, Grocery, Beauty, Sports &
Outdoors, Books. Each has 3–6 categories. Seed: about 700 products, deterministic; categories vary from 6 to 32 products, so several paginate.

- Top nav lists departments; each department page shows its categories and featured products.
- Category listing (`/c/:department/:category`): product cards (image, name, price, sale price,
  rating, stock badge), **filters** (price range, brand, rating ≥ n, in stock, on sale),
  **sort** (relevance, price ↑↓, rating, newest), **pagination** (24 per page, page links).
- Filters, sort and page live in the URL query string, so every listing state is linkable,
  works without JS (a GET form), and is SSR'd.
- With JS, changing a filter updates results without a full reload (router + http driver) and
  keeps focus and scroll sensible; an `aria-live` region announces the result count.
- Empty states for no results; out-of-stock items are shown but marked.

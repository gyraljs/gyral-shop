# Search

- Header search box on every page (`<search>` + GET form to `/search?q=`).
- With JS: suggestions after typing pauses (debounced, cancels stale requests), accessible
  combobox (arrow keys, Enter, Escape, closes on blur), showing product and category matches.
- Results page reuses the listing (filters, sort, pagination) with "relevance" ranking:
  name match > brand match > category match > description match.
- "No results" page suggests departments and popular products.
- SQLite FTS5 behind a repository (department and category suggestions match names with
  LIKE); queries are parameterized.

## Implementation notes (shop-y8c.1)

- `products_fts` (FTS5, `unicode61 remove_diacritics 2`, prefix indexes) is created by the
  custom migration `drizzle/0002_search_fts.sql` and kept in sync by triggers on `products`.
  Brand, category and department names are copied in at write time; renaming a brand,
  category or department updates the index through triggers (`drizzle/0006_taxonomy_reindex.sql`).
- Ranking: bm25 with column weights name 10, brand 5, category 3, department 2,
  description 1 (`src/db/repos/search.ts`); ties by rating. Every word must match, as a
  prefix. User text is reduced to letters and digits (`src/domain/search.ts`), so FTS
  operators and quotes are always plain words.
- `/search?q=` is one URL per search: whitespace and listing parameters are canonicalized by
  a single 301. All search pages are `noindex`. Results reuse `<shop-listing>` through the
  listing's `fixedQuery` (`q=…`) and `relevanceLabel` ("Best match").

- Suggestions list matching departments (up to 2) before categories (up to 3) and products (up to 6): "kitch" names no category but leads to Home & Kitchen.

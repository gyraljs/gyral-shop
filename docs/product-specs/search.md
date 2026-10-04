# Search

- Header search box on every page (`<search>` + GET form to `/search?q=`).
- With JS: suggestions after typing pauses (debounced, cancels stale requests), accessible
  combobox (arrow keys, Enter, Escape, closes on blur), showing product and category matches.
- Results page reuses the listing (filters, sort, pagination) with "relevance" ranking:
  name match > brand match > category match > description match.
- "No results" page suggests departments and popular products.
- SQLite FTS5 (or LIKE fallback) behind a repository; queries are parameterized.

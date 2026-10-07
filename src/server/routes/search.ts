// Search results (docs/product-specs/search.md). Mounted by app.ts.
import { Hono } from 'hono';
import type { Db } from '../../db/client.js';
import { parseListing } from '../../domain/listing.js';
import { parseSearchQuery } from '../../domain/search.js';
import { searchPage, searchSuggestions } from '../../services/search.js';
import { SUGGEST_API } from '../../ui/layout/suggestions.js';
import { listingTitle } from '../../ui/catalog/listing-view.js';
import {
  noResults,
  resultsHeading,
  searchListing,
  searchPath,
  searchPrompt,
  searchResults,
} from '../../ui/pages/search.js';
import type { RenderPage } from '../document.js';
import { LISTING_CHUNKS } from '../route-chunks.js';

export interface SearchRouteOptions {
  readonly db: Db;
  readonly render: RenderPage;
}

export function searchRoutes({ db, render }: SearchRouteOptions): Hono {
  const routes = new Hono();

  routes.get('/search', async (c) => {
    const params = new URL(c.req.url).searchParams;
    const query = parseSearchQuery(params.get('q'));
    const listing = parseListing(params);
    const q = query.ok ? query.value : query.error.q;
    const state = listing.ok ? listing.value : listing.error.state;
    // One URL per search: extra spaces, `?page=1`, empty filter fields and junk redirect once.
    // Without a query (missing or blank) there is nothing to refine: everything goes to /search.
    if (!query.ok || !listing.ok || (q === '' && params.size > 0)) {
      return c.redirect(q === '' ? '/search' : searchPath(q, state), 301);
    }
    const result = await searchPage(db, q, state);
    // Search result pages stay out of the index (SEO spec), found or not.
    switch (result._tag) {
      case 'OutOfRange':
        return c.notFound();
      case 'Empty':
        return render({
          title: 'Search',
          description: 'Search Gyral Goods by product, brand or category.',
          noindex: true,
          main: searchPrompt(result.suggestions),
        });
      case 'Found': {
        const { data } = result;
        if (data.suggestions !== undefined) {
          return render({
            title: resultsHeading(q),
            description: `No products match “${q}” at Gyral Goods.`,
            noindex: true,
            query: q,
            main: noResults(q, data.suggestions),
          });
        }
        return render({
          title: listingTitle(searchListing(data)),
          description: `Products matching “${q}” at Gyral Goods.`,
          noindex: true,
          query: q,
          chunks: LISTING_CHUNKS,
          main: searchResults(data),
        });
      }
    }
  });

  // The same results as JSON, for <shop-listing> updates without a reload. Lenient like the
  // category endpoint: non-canonical input is answered for its canonical form.
  routes.get('/api/listing/search', async (c) => {
    const params = new URL(c.req.url).searchParams;
    const query = parseSearchQuery(params.get('q'));
    const listing = parseListing(params);
    const q = query.ok ? query.value : query.error.q;
    if (q === '') return c.json({ error: 'missing_query' }, 400);
    const result = await searchPage(db, q, listing.ok ? listing.value : listing.error.state);
    if (result._tag !== 'Found') return c.json({ error: 'not_found' }, 404);
    c.header('cache-control', 'no-store');
    return c.json(searchListing(result.data));
  });

  // Header suggestions (search spec): short-lived cache, no session, never indexed.
  routes.get(SUGGEST_API, async (c) => {
    const q = c.req.query('q') ?? '';
    return c.json(await searchSuggestions(db, q), 200, {
      'cache-control': 'public, max-age=60',
      'x-robots-tag': 'noindex',
    });
  });

  return routes;
}

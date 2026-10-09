// The managed head of a listing page (docs/product-specs/seo.md): title, description,
// canonical, robots and breadcrumb structured data. One pure function, so the server's page and
// <shop-listing>'s setHead() after an update without a reload always agree (Gyral's head model).
import type { Head } from '@gyral/core';
import { isRefined } from '../../domain/listing.js';
import { documentTitle } from '../layout/site.js';
import { breadcrumbJsonLd } from './breadcrumbs.js';
import { listingHref, listingTitle, resultSummary, type ListingView } from './listing-view.js';

export function listingHead(view: ListingView, origin: string): Head {
  const title = documentTitle(listingTitle(view));
  const q = new URLSearchParams(view.fixedQuery ?? '').get('q');
  if (q !== null) {
    // Search results stay out of the index, found or not.
    return { title, description: `Products matching “${q}” at Gyral Goods.`, robots: 'noindex' };
  }
  // Pages of the plain listing are their own canonical URLs (Google's guidance). Sorted or
  // filtered states point to the plain listing and stay out of the index.
  const refined = isRefined(view.state);
  const path = refined ? view.basePath : listingHref(view, { page: view.state.page });
  return {
    title,
    description: `Shop ${view.heading.toLowerCase()} in ${view.context} at Gyral Goods. ${resultSummary(view)}.`,
    canonical: new URL(path, origin).href,
    ...(refined ? { robots: 'noindex' } : {}),
    jsonLd: view.crumbs === undefined ? [] : [breadcrumbJsonLd(origin, view.crumbs, view.basePath)],
  };
}

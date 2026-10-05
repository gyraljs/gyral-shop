// Search query rules (docs/product-specs/search.md). Pure: the database's query syntax lives
// in src/db/repos/search.ts; this module decides what a shopper's text means.
import { err, ok, type Result } from './result.js';

/** Longest query kept, in characters (after trimming and collapsing spaces). */
export const MAX_QUERY_LENGTH = 100;
/** At most this many words take part in matching; the rest are ignored. */
export const MAX_TERMS = 8;

/** The `q` parameter carries a different spelling of a valid query: redirect to `q`. */
export interface NoncanonicalQuery {
  readonly _tag: 'NoncanonicalQuery';
  readonly q: string;
}

/** Trims, collapses whitespace and caps the length. `''` means "no query". */
export const normalizeQuery = (raw: string): string =>
  raw.replace(/\s+/gu, ' ').trim().slice(0, MAX_QUERY_LENGTH).trim();

/**
 * Parses the `q` parameter. A missing parameter is the empty query. A spelling with extra
 * whitespace or over-long text yields the canonical query to redirect to, so each search has
 * one URL.
 */
export function parseSearchQuery(
  raw: string | null | undefined,
): Result<string, NoncanonicalQuery> {
  if (raw === null || raw === undefined) return ok('');
  const q = normalizeQuery(raw);
  return q === raw ? ok(q) : err({ _tag: 'NoncanonicalQuery', q });
}

/**
 * The words a query searches for: runs of letters and digits, lower-cased, de-duplicated, in
 * order. Punctuation and operators are separators, never syntax, so any text is safe to search.
 */
export function searchTerms(q: string): string[] {
  const words = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words)].slice(0, MAX_TERMS);
}

/** The canonical query string of a search, e.g. `q=wireless+earbuds`. */
export const searchQueryString = (q: string): string => new URLSearchParams({ q }).toString();

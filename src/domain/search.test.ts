import { describe, expect, it } from 'vitest';
import {
  MAX_QUERY_LENGTH,
  MAX_TERMS,
  normalizeQuery,
  parseSearchQuery,
  searchQueryString,
  searchTerms,
} from './search.js';

describe('search queries', () => {
  it('treats a missing or canonical query as itself', () => {
    expect(parseSearchQuery(null)).toEqual({ ok: true, value: '' });
    expect(parseSearchQuery('wireless earbuds')).toEqual({ ok: true, value: 'wireless earbuds' });
  });

  it('redirects other spellings to the canonical query', () => {
    expect(parseSearchQuery('  wireless   earbuds ')).toEqual({
      ok: false,
      error: { _tag: 'NoncanonicalQuery', q: 'wireless earbuds' },
    });
    const long = 'a'.repeat(MAX_QUERY_LENGTH + 20);
    const parsed = parseSearchQuery(long);
    expect(parsed.ok ? '' : parsed.error.q).toHaveLength(MAX_QUERY_LENGTH);
  });

  it('is idempotent: a normalized query is canonical', () => {
    const samples = [
      '',
      ' a ',
      'tv\t\n4k',
      'x'.repeat(300),
      ' “smart” — speaker! ',
      'café   au lait',
    ];
    for (const raw of samples) {
      const q = normalizeQuery(raw);
      expect(parseSearchQuery(q)).toEqual({ ok: true, value: q });
    }
  });

  it('turns any text into plain words, so FTS syntax can never leak through', () => {
    expect(searchTerms('Wireless "Earbuds" OR NEAR(x*) -tv')).toEqual([
      'wireless',
      'earbuds',
      'or',
      'near',
      'x',
      'tv',
    ]);
    expect(searchTerms('Café crème 4K')).toEqual(['café', 'crème', '4k']);
    expect(searchTerms('*** "" ()')).toEqual([]);
    expect(searchTerms('a a b A')).toEqual(['a', 'b']);
    expect(searchTerms('1 2 3 4 5 6 7 8 9 10')).toHaveLength(MAX_TERMS);
  });

  it('spells the query string canonically', () => {
    expect(searchQueryString('wireless earbuds')).toBe('q=wireless+earbuds');
    expect(searchQueryString('a&b')).toBe('q=a%26b');
  });
});

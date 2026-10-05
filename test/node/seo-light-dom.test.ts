// Raw-HTML crawlers may treat <template shadowrootmode> content as inert, so a listing's main
// content must be plain light DOM in the server's HTML (Gyral ADR 0014, shop bead shop-oya).
import { describe, expect, it } from 'vitest';
import { testApp } from '../support/app.js';
import { fixtureCategory } from '../support/listing.js';

/** Byte ranges of every declarative shadow root in the document. */
function shadowRanges(html: string): (readonly [number, number])[] {
  const ranges: (readonly [number, number])[] = [];
  const open = /<template\s[^>]*shadowrootmode=/g;
  for (const match of html.matchAll(open)) {
    // Templates may nest: find the matching </template>.
    let depth = 0;
    const tags = /<template\b|<\/template>/g;
    tags.lastIndex = match.index;
    for (const tag of html.matchAll(tags)) {
      depth += tag[0] === '</template>' ? -1 : 1;
      if (depth === 0) {
        ranges.push([match.index, tag.index]);
        break;
      }
    }
  }
  return ranges;
}

/** Positions of `pattern` in `html` that sit outside every shadow root. */
function inLightDom(html: string, pattern: RegExp): number {
  const ranges = shadowRanges(html);
  const hits = [...html.matchAll(new RegExp(pattern.source, 'g'))];
  return hits.filter((hit) => !ranges.some(([from, to]) => hit.index > from && hit.index < to))
    .length;
}

describe('listing content is light DOM in the server HTML', () => {
  it('on category pages: the heading, product links and prices', async () => {
    const test = await testApp();
    const { path } = await fixtureCategory(test.db);
    const html = await (await test.get(path)).text();
    const products = [...html.matchAll(/href="\/p\/fixture-/g)].length;
    expect(products).toBeGreaterThan(0);
    expect(inLightDom(html, /<h1[\s>]/)).toBe(1);
    expect(inLightDom(html, /href="\/p\/fixture-/)).toBe(products);
    expect(inLightDom(html, /data-component="price"/)).toBe(products);
    // Every shadow root that remains belongs to a widget, not to the listing.
    expect(shadowRanges(html).length).toBeGreaterThan(0);
  });

  it('on search results', async () => {
    const test = await testApp();
    await fixtureCategory(test.db);
    const html = await (await test.get('/search?q=golf')).text();
    expect(inLightDom(html, /<h1[\s>]/)).toBe(1);
    expect(inLightDom(html, /href="\/p\/fixture-golf"/)).toBeGreaterThan(0);
    expect(inLightDom(html, /data-component="price"/)).toBeGreaterThan(0);
  });
});

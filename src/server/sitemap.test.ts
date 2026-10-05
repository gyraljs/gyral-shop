import { describe, expect, it } from 'vitest';
import { chunkSitemap, robotsTxt, sitemapIndexXml, urlsetXml } from './sitemap.js';

describe('sitemap builders', () => {
  it('escapes locations and writes day-precision lastmod', () => {
    const xml = urlsetXml([
      { loc: 'https://x.test/search?a=1&b=<2>' },
      { loc: 'https://x.test/p/a', lastmod: new Date('2026-10-04T12:00:00Z') },
    ]);
    expect(xml).toContain('<loc>https://x.test/search?a=1&#38;b=&#60;2&#62;</loc>');
    expect(xml).toContain('<lastmod>2026-10-04</lastmod>');
    expect(sitemapIndexXml(['https://x.test/sitemaps/1.xml'])).toContain('<sitemapindex ');
  });

  it('chunks to the per-file limit and always returns at least one file', () => {
    expect(chunkSitemap([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkSitemap([], 2)).toEqual([[]]);
  });

  it('robots.txt points to the sitemap on the given origin', () => {
    expect(robotsTxt('https://shop.test')).toMatch(
      /Sitemap: https:\/\/shop\.test\/sitemap\.xml\n$/,
    );
  });
});

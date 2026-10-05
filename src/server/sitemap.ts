// Sitemap and robots.txt builders (seo.md; sitemaps.org protocol). Pure, so they're unit-tested.

/** The protocol's per-file limit; above it the sitemap becomes an index of numbered files. */
export const MAX_URLS_PER_SITEMAP = 50_000;

export interface SitemapEntry {
  readonly loc: string;
  readonly lastmod?: Date | null;
}

const escapeXml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

const day = (d: Date): string => d.toISOString().slice(0, 10);

export function urlsetXml(entries: readonly SitemapEntry[]): string {
  const urls = entries
    .map(({ loc, lastmod }) =>
      lastmod == null
        ? `<url><loc>${escapeXml(loc)}</loc></url>`
        : `<url><loc>${escapeXml(loc)}</loc><lastmod>${day(lastmod)}</lastmod></url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function sitemapIndexXml(sitemaps: readonly string[]): string {
  const items = sitemaps.map((loc) => `<sitemap><loc>${escapeXml(loc)}</loc></sitemap>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
}

/** Splits entries into protocol-sized files (one file when they fit). */
export function chunkSitemap<T>(entries: readonly T[], size = MAX_URLS_PER_SITEMAP): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < entries.length; i += size) chunks.push(entries.slice(i, i + size));
  return chunks.length === 0 ? [[]] : chunks;
}

/** Paths crawlers should skip: personal, transactional and machine endpoints. */
export const DISALLOWED_PATHS = [
  '/account',
  '/cart',
  '/checkout',
  '/order',
  '/admin',
  '/api/',
  '/dev/',
] as const;

export function robotsTxt(origin: string): string {
  const lines = ['User-agent: *', ...DISALLOWED_PATHS.map((p) => `Disallow: ${p}`)];
  return `${lines.join('\n')}\n\nSitemap: ${new URL('/sitemap.xml', origin).href}\n`;
}

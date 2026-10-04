// Product images are generated SVG placeholders (no network, no binary assets): a colour
// derived from the product slug and the product's initials. Deterministic and cacheable.

const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (ch) => `&#${String(ch.charCodeAt(0))};`);

/** `slug` like `voltra-sleek-4k-tv-12`, `view` 1..n. */
export function placeholderSvg(slug: string, view: number): string {
  const hue = (hash(slug) + view * 47) % 360;
  const words = slug.split('-').filter((w) => !/^\d+$/.test(w));
  const initials = words
    .slice(1, 3)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
  const label = escapeXml(words.slice(1).join(' ').slice(0, 28));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${String(hue)} 70% 88%)"/><stop offset="1" stop-color="hsl(${String((hue + 40) % 360)} 60% 72%)"/>
</linearGradient></defs>
<rect width="400" height="400" fill="url(#g)"/>
<text x="200" y="215" font-family="system-ui,sans-serif" font-size="120" font-weight="700" text-anchor="middle" fill="hsl(${String(hue)} 45% 30%)">${escapeXml(initials)}</text>
<text x="200" y="300" font-family="system-ui,sans-serif" font-size="22" text-anchor="middle" fill="hsl(${String(hue)} 35% 30%)">${label}</text>
</svg>`;
}

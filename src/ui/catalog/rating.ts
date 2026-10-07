// Star ratings without inline styles (strict CSP: no `style` attributes). The fill is a
// `data-rating` step from 0.0 to 5.0; `ratingCss` maps each step to the `--rating` custom
// property that `.stars` paints (styles/catalog.ts).

/** A rating as its `data-rating` step: clamped to 0–5, one decimal ("4.0", "4.3"). */
export const ratingStep = (rating: number): string =>
  (Math.round(Math.min(5, Math.max(0, rating)) * 10) / 10).toFixed(1);

/** One rule per step, so CSS can read the rating without a `style` attribute. */
export const ratingCss = Array.from({ length: 51 }, (_, n) => {
  const step = (n / 10).toFixed(1);
  return `[data-rating="${step}"] { --rating: ${step}; }`;
}).join('\n');

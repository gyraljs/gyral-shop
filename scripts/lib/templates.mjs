// Lit hydration guard (shop-hb9). A text binding that renders '' on the server leaves no text
// node; Lit's first client update then writes into the closing <!--/lit-part--> marker and the
// content never appears. Text positions must render `nothing` for "no content", never ''.

const EMPTY_FALLBACK = /(\?\?|\|\|)\s*''/g;

/** Index of the `${` that opens the interpolation containing `pos`, or -1 if none. */
function enclosingInterpolation(text, pos) {
  let depth = 0;
  for (let i = pos - 1; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === '}') depth += 1;
    else if (ch === '{') {
      if (depth === 0) return text[i - 1] === '$' ? i - 1 : -1;
      depth -= 1;
    }
  }
  return -1;
}

/**
 * Whether the interpolation starting at `start` sits in text position of an html`` template:
 * walk back over static template text (skipping earlier interpolations) to the nearest `>` (text)
 * or `<` (inside a tag: attribute or property binding).
 */
function inTextPosition(text, start) {
  let i = start - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '>') return true;
    if (ch === '<') return false;
    if (ch === '`') return /(?:html|svg)\s*$/.test(text.slice(Math.max(0, i - 8), i));
    if (ch === '}') {
      // Skip an earlier interpolation `${…}` back to its `$`.
      const open = enclosingInterpolation(text, i);
      if (open === -1) return false;
      i = open - 1;
      continue;
    }
    i -= 1;
  }
  return false;
}

/** Findings for empty-string fallbacks rendered as template text. */
export function emptyTextBindings(file, text) {
  const findings = [];
  for (const match of text.matchAll(EMPTY_FALLBACK)) {
    const open = enclosingInterpolation(text, match.index);
    if (open === -1 || !inTextPosition(text, open)) continue;
    const line = text.slice(0, match.index).split('\n').length;
    findings.push(
      `${file}:${String(line)}: \`${match[0]}\` renders an empty text part. Lit cannot hydrate ` +
        `it (the first client update writes into the closing marker). Use \`?? nothing\` ` +
        `(import nothing from @gyral/core) for "no content".`,
    );
  }
  return findings;
}

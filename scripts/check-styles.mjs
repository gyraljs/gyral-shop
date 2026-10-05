import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isExempt,
  relativeColourFromTokens,
  styleViolations,
  unlayeredStyles,
} from './lib/styles.mjs';

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(join(dir, e.name))
      : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')
        ? [join(dir, e.name)]
        : [],
  );
}

const errors = files('src/ui').flatMap((f) => {
  const text = readFileSync(f, 'utf8');
  // Token definitions (base.ts) may hold literals, but no file outside the themes may derive
  // colours from tokens.
  const contract = isExempt(f) ? [] : [...styleViolations(f, text), ...unlayeredStyles(f, text)];
  return [...contract, ...relativeColourFromTokens(f, text)];
});

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('styles: tokens only, layered, no relative colour from tokens outside themes');

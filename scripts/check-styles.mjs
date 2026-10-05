import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isExempt, styleViolations, unlayeredStyles } from './lib/styles.mjs';

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(join(dir, e.name))
      : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')
        ? [join(dir, e.name)]
        : [],
  );
}

const errors = files('src/ui')
  .filter((f) => !isExempt(f))
  .flatMap((f) => {
    const text = readFileSync(f, 'utf8');
    return [...styleViolations(f, text), ...unlayeredStyles(f, text)];
  });

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('styles: tokens only, every stylesheet in a cascade layer');

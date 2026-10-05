import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isExempt, styleViolations } from './lib/styles.mjs';

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
  .flatMap((f) => styleViolations(f, readFileSync(f, 'utf8')));

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('styles: no literal colours, fonts or var() fallbacks outside tokens/themes');

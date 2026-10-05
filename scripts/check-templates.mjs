import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyTextBindings } from './lib/templates.mjs';

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(join(dir, e.name))
      : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')
        ? [join(dir, e.name)]
        : [],
  );
}

const errors = ['src/ui', 'src/server'].flatMap((dir) =>
  files(dir).flatMap((f) => emptyTextBindings(f, readFileSync(f, 'utf8'))),
);

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('templates: no empty-string text bindings');

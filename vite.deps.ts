// Dependency pre-bundling list for Vite and Vitest, derived from the source (ADR 0005).
//
// Vite pre-bundles dependencies once and caches them. When code later imports a module the cache
// lacks (a new import in the shop, or in linked Gyral), Vite discovers it mid-run, re-optimizes
// and reloads the page, and Vitest's browser suites fail with "Failed to fetch dynamically
// imported module". Listing every bare import of the browser import graph in
// `optimizeDeps.include` changes the config whenever a new import appears, so Vite re-optimizes
// at startup instead.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gyralVitePreset } from '@gyral/core/vite';

const root = dirname(fileURLToPath(import.meta.url));

/** Where the browser import graph starts: shop UI, the client entry and browser tests. */
const ENTRY_DIRS = ['src/ui', 'src/client', 'test/browser'];

const IMPORT =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function files(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile())
    return /\.(ts|js|mjs)$/.test(path) && !path.endsWith('.d.ts') ? [path] : [];
  return readdirSync(path).flatMap((name) => files(join(path, name)));
}

/** Module specifiers a file imports (type-only imports excluded). */
export function importsOf(source: string): string[] {
  return [...source.matchAll(IMPORT)].flatMap((m) => {
    const spec = m[1] ?? m[2];
    return spec === undefined ? [] : [spec];
  });
}

/** A relative import as a file path (`./x.js` written for `./x.ts`), if it exists. */
function relativeFile(from: string, spec: string): string | undefined {
  const base = resolve(dirname(from), spec);
  const candidates = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, join(base, 'index.ts')];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile());
}

const packageName = (spec: string): string =>
  spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : (spec.split('/')[0] ?? spec);

function resolvesFrom(dir: string, spec: string): boolean {
  try {
    createRequire(join(dir, 'noop.js')).resolve(spec);
    return true;
  } catch {
    // ESM-only packages may lack a "require" condition; the installed package still counts.
    return existsSync(join(dir, 'node_modules', packageName(spec), 'package.json'));
  }
}

/** The source file a linked `@gyral/<pkg>[/subpath]` specifier maps to (package exports). */
function gyralFile(
  spec: string,
): { readonly pkg: string; readonly dir: string; readonly file: string } | undefined {
  const [, pkg, sub] = /^@gyral\/([^/]+)(?:\/(.+))?$/.exec(spec) ?? [];
  if (pkg === undefined) return undefined;
  const link = join(root, 'node_modules', '@gyral', pkg);
  if (!existsSync(link)) return undefined;
  const dir = realpathSync(link);
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    exports?: Record<string, string | Record<string, string>>;
  };
  const target = manifest.exports?.[sub === undefined ? '.' : `./${sub}`];
  const path = typeof target === 'string' ? target : (target?.['default'] ?? target?.['import']);
  return path === undefined ? undefined : { pkg, dir, file: resolve(dir, path) };
}

/**
 * Every module to pre-bundle: Gyral's Lit list plus each bare import reachable from the browser
 * entry points, following relative imports and entering linked Gyral packages through the
 * subpaths actually imported. Imports only Gyral can resolve become `@gyral/<pkg> > dep`.
 */
export function optimizedDeps(): string[] {
  const include = new Set(gyralVitePreset().optimizeDeps.include);
  const seen = new Set<string>();
  const queue: { readonly file: string; readonly owner?: { pkg: string; dir: string } }[] =
    ENTRY_DIRS.flatMap((d) => files(join(root, d))).map((file) => ({ file }));
  while (queue.length > 0) {
    const next = queue.pop();
    if (next === undefined || seen.has(next.file)) continue;
    seen.add(next.file);
    for (const spec of importsOf(readFileSync(next.file, 'utf8'))) {
      if (/^(node:|#|virtual:)/.test(spec) || spec.includes('?')) continue;
      if (spec.startsWith('.')) {
        const file = relativeFile(next.file, spec);
        if (file !== undefined) queue.push({ file, ...(next.owner ? { owner: next.owner } : {}) });
        continue;
      }
      if (spec.startsWith('@gyral/')) {
        const linked = gyralFile(spec);
        if (linked !== undefined) queue.push({ file: linked.file, owner: linked });
        continue;
      }
      if (/^(vitest|@vitest\/)/.test(spec)) continue;
      if (resolvesFrom(root, spec)) include.add(spec);
      else if (next.owner !== undefined && resolvesFrom(next.owner.dir, spec)) {
        include.add(`@gyral/${next.owner.pkg} > ${spec}`);
      }
    }
  }
  return [...include].sort();
}

export const LIT_PACKAGES: readonly string[] = gyralVitePreset().resolve.dedupe;

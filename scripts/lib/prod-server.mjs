// Shared by `pnpm perf` and `pnpm smoke:prod`: a seeded throwaway database, a production build
// and the production server on a free port.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const freePort = () =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

/** Runs a command; an `undefined` value in `env` removes that variable. */
function run(cmd, cmdArgs, env, quiet) {
  const merged = { ...process.env, ...env };
  for (const [key, value] of Object.entries(merged)) if (value === undefined) delete merged[key];
  const result = spawnSync(cmd, cmdArgs, {
    stdio: quiet ? 'pipe' : 'inherit',
    encoding: 'utf8',
    env: merged,
  });
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${cmdArgs.join(' ')} failed\n${result.stdout ?? ''}${result.stderr ?? ''}`,
    );
  }
}

async function waitFor(url, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server did not start: ${url}`);
}

/**
 * Seeds a throwaway database, builds (unless `build: false` and dist/client exists), and starts
 * the production server. Returns `{ base, stop }`; `stop()` kills the server's process group and
 * removes the database.
 */
export async function startProduction({ build = true, quiet = false } = {}) {
  const work = mkdtempSync(join(tmpdir(), 'shop-prod-'));
  const env = {
    NODE_ENV: 'production',
    APP_SECRET: randomBytes(32).toString('hex'),
    DATABASE_URL: `file:${join(work, 'shop.db')}`,
  };
  const dev = { ...env, NODE_ENV: 'development' };
  let server;
  const stop = () => {
    if (server?.pid !== undefined) {
      try {
        process.kill(-server.pid, 'SIGTERM'); // the whole process group
      } catch {
        // already gone
      }
    }
    rmSync(work, { recursive: true, force: true });
  };
  try {
    run('pnpm', ['exec', 'tsx', 'src/db/migrate.ts'], dev, quiet);
    run('pnpm', ['exec', 'tsx', 'scripts/seed.ts'], dev, quiet);
    // Prerendering reads the catalog, so the build runs against the seeded database. Without
    // NODE_ENV, as `pnpm build` is run for a deployment: under NODE_ENV=development, Vite (and
    // with it Gyral's preset) makes a development build, with its checks and messages.
    if (build || !existsSync('dist/client'))
      run('pnpm', ['build'], { ...dev, NODE_ENV: undefined }, quiet);
    const port = await freePort();
    const base = `http://localhost:${String(port)}`;
    server = spawn('pnpm', ['exec', 'tsx', 'src/server/prod.ts'], {
      env: { ...process.env, ...env, PORT: String(port), SITE_ORIGIN: base },
      stdio: 'ignore',
      detached: true, // its own process group, so the whole tree stops with it
    });
    await waitFor(`${base}/`);
    return { base, stop };
  } catch (error) {
    stop();
    throw error;
  }
}

/** Finds a department, category and product path by following links from the home page. */
export async function discoverPaths(base) {
  const home = await (await fetch(`${base}/`)).text();
  const department = /href="(\/d\/[^"]+)"/.exec(home)?.[1] ?? '/d/electronics';
  const deptHtml = await (await fetch(`${base}${department}`)).text();
  const category = /href="(\/c\/[^"?#]+)"/.exec(deptHtml)?.[1];
  const catHtml = await (await fetch(`${base}${category ?? ''}`)).text();
  const product = /href="(\/p\/[^"?#/]+)"/.exec(catHtml)?.[1];
  if (category === undefined || product === undefined) throw new Error('no category/product link');
  return { department, category, product };
}

// Dev server: Vite serves browser modules (with HMR); every other request is server-rendered
// by the Hono app, re-loaded per request so SSR follows source edits.
import http from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { createServer as createViteServer } from 'vite';
import { loadConfig } from '../config/env.js';
import { openDb } from '../db/client.js';
import { startPurgeSchedule } from '../services/maintenance.js';
import { devAppOptions } from './dev-options.js';

// One connection for the dev server's lifetime; run `pnpm db:reset` first.
const config = loadConfig();
const db = await openDb(config.DATABASE_URL);
startPurgeSchedule(db); // expired sessions and orphaned guest carts, hourly

const port = Number(process.env['PORT'] ?? 5200);
const hmrPort = Number(process.env['HMR_PORT'] ?? 24690);
const vite = await createViteServer({
  server: { middlewareMode: true, ws: { port: hmrPort } },
  appType: 'custom',
});

// Built once: per-request apps must share the secret (see dev-options.ts).
const options = devAppOptions(config, db);

const ssr = getRequestListener(async (request) => {
  const mod = (await vite.ssrLoadModule('/src/server/app.ts')) as typeof import('./app.js');
  return mod.createApp(options).fetch(request);
});

http
  .createServer((req, res) => {
    vite.middlewares(req, res, () => void ssr(req, res));
  })
  .listen(port, () => {
    console.log(`gyral-shop: http://localhost:${String(port)}`);
  });

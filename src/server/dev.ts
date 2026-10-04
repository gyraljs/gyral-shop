// Dev server: Vite serves browser modules (with HMR); every other request is server-rendered
// by the Hono app, re-loaded per request so SSR follows source edits.
import http from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { createServer as createViteServer } from 'vite';
import { loadConfig } from '../config/env.js';
import { openDb } from '../db/client.js';

// One connection for the dev server's lifetime; run `pnpm db:reset` first.
const db = await openDb(loadConfig().DATABASE_URL);

const port = Number(process.env['PORT'] ?? 5200);
const hmrPort = Number(process.env['HMR_PORT'] ?? 24690);
const vite = await createViteServer({
  server: { middlewareMode: true, ws: { port: hmrPort } },
  appType: 'custom',
});

const ssr = getRequestListener(async (request) => {
  const mod = (await vite.ssrLoadModule('/src/server/app.ts')) as typeof import('./app.js');
  return mod
    .createApp({ clientEntry: '/src/client/entry.ts', db, security: { dev: true } })
    .fetch(request);
});

http
  .createServer((req, res) => {
    vite.middlewares(req, res, () => void ssr(req, res));
  })
  .listen(port, () => {
    console.log(`gyral-shop: http://localhost:${String(port)}`);
  });

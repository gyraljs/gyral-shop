// Page views for prerendered pages (shop-8c2). Server-rendered pages are counted by the
// server's analytics middleware; static files never reach it, so after hydration a static page
// sends one beacon, only when the visitor accepted analytics. The server checks consent again.
import { command, defineDriver, type Command } from '@gyral/core';

/** Kept in sync with src/server/routes/analytics.ts (ui may not import server code). */
export const PAGE_VIEW_PATH = '/api/analytics/page-view';

export interface PageView {
  readonly path: string;
}

/** Fire-and-forget: sendBeacon survives navigation and needs no answer. */
export const beaconDriver = defineDriver<PageView, boolean>({
  name: 'beacon',
  run: (view) => {
    const body = new Blob([JSON.stringify(view)], { type: 'application/json' });
    return typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(PAGE_VIEW_PATH, body);
  },
});

export const pageViewBeacon = (path: string): Command<never> =>
  command<PageView, boolean, unknown, never>(
    beaconDriver,
    { path },
    {
      onSuccess: () => undefined,
      key: 'page-view',
    },
  );

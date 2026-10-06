import { resetDocumentStores } from '@gyral/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import serverHtml from '../fixtures/static-about.ssr.html?raw';
import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';
import { PAGE_VIEW_PATH } from '../../src/ui/analytics/beacon.js';

// A prerendered page counts its own page view (shop-8c2): after hydration, one beacon, and
// only when /api/me says the visitor accepted analytics.
let page: MountedSsr | undefined;

async function visit(analytics: boolean) {
  const requests: string[] = [];
  vi.spyOn(window, 'fetch').mockImplementation((input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    requests.push(url.pathname);
    const body =
      url.pathname === '/api/me' ? { account: null, consentDecided: true, analytics } : {};
    return Promise.resolve(Response.json(body));
  });
  const sendBeacon = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(true);
  page = mountSsr(serverHtml);
  await import('../../src/client/entry.js');
  await hydrated(page);
  await vi.waitFor(() => {
    expect(requests).toContain('/api/me');
  });
  await new Promise((r) => setTimeout(r, 50)); // let the store's answer reach the banner
  return { sendBeacon, requests };
}

afterEach(() => {
  page?.unmount();
  page = undefined;
  resetDocumentStores();
  vi.restoreAllMocks();
});

describe('page-view beacon on a prerendered page', () => {
  it('sends one beacon when the visitor accepted analytics', async () => {
    const { sendBeacon, requests } = await visit(true);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, body] = sendBeacon.mock.calls[0] ?? [];
    expect(url).toBe(PAGE_VIEW_PATH);
    expect(JSON.parse(await (body as Blob).text())).toEqual({ path: location.pathname });
    expect(requests.filter((p) => p === '/api/me')).toHaveLength(1);
  });

  it('sends nothing without analytics consent', async () => {
    const { sendBeacon } = await visit(false);
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});

// Browser tests of the cart store: a stand-in for the cart JSON API. `fetch` is stubbed for
// /api/* only, so the real driver code runs; each request waits until the test answers it,
// which makes optimistic states observable.
import { vi } from 'vitest';

export interface ApiCall {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
  readonly headers: Headers;
  readonly respond: (status: number, json: unknown) => void;
  readonly fail: () => void;
}

export function stubCartApi(): { readonly calls: ApiCall[]; readonly restore: () => void } {
  const calls: ApiCall[] = [];
  const original = window.fetch.bind(window);
  const spy = vi.spyOn(window, 'fetch').mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!new URL(url, location.href).pathname.startsWith('/api/')) return original(input, init);
    return new Promise<Response>((resolve, reject) => {
      const raw = init?.body;
      calls.push({
        method: init?.method ?? 'GET',
        url,
        body: typeof raw === 'string' ? (JSON.parse(raw) as unknown) : undefined,
        headers: new Headers(init?.headers),
        respond: (status, json) => {
          resolve(
            new Response(JSON.stringify(json), {
              status,
              headers: { 'content-type': 'application/json' },
            }),
          );
        },
        fail: () => {
          reject(new TypeError('Failed to fetch'));
        },
      });
    });
  });
  return {
    calls,
    restore: () => {
      spy.mockRestore();
    },
  };
}

export interface LineSpec {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitCents: number;
  readonly listCents?: number;
}

const usd = (cents: number) => ({ cents, currency: 'USD' as const });

/** A cart view as the server's JSON API sends it (totals nested in `breakdown`). */
export function serverCart(
  lines: readonly LineSpec[],
  promo?: { code: string; applied: boolean; message?: string },
) {
  const subtotal = lines.reduce((n, l) => n + l.unitCents * l.quantity, 0);
  const savings = lines.reduce(
    (n, l) => n + ((l.listCents ?? l.unitCents) - l.unitCents) * l.quantity,
    0,
  );
  return {
    lines: lines.map((l) => ({
      sku: l.sku,
      quantity: l.quantity,
      productName: l.name,
      href: `/p/${l.name.toLowerCase()}`,
      options: {},
      unit: usd(l.unitCents),
      listPrice: usd(l.listCents ?? l.unitCents),
      onSale: (l.listCents ?? l.unitCents) > l.unitCents,
      lineTotal: usd(l.unitCents * l.quantity),
      maxQuantity: 10,
      availability: { _tag: 'InStock' },
    })),
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    breakdown: {
      lines: [],
      subtotal: usd(subtotal),
      savings: usd(savings),
      discount: usd(0),
      shipping: usd(0),
      tax: usd(0),
      taxRate: 0,
      taxPending: true,
      total: usd(subtotal),
    },
    ...(promo === undefined ? {} : { promo }),
    canCheckout: lines.length > 0,
  };
}

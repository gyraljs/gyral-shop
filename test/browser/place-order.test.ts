// ORDER IS LOAD-BEARING: hydrate support before anything that imports Lit (Gyral ADR 0012).
import '@gyral/ssr/hydrate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import reviewHtml from '../fixtures/checkout-review.ssr.html?raw';
import placed from '../fixtures/checkout-placed.json';
import declined from '../fixtures/checkout-declined.json';
import { hydrated, mountSsrPage, type MountedPage } from '../support/page.js';

// Placing an order with JavaScript (shop-8w0): the review step's form goes through Gyral's
// submitForm to /checkout/place, and the server's answer (fixtures written by
// test/node/place-order-js.test.ts) drives a full navigation to the confirmation page.

const errors = vi.spyOn(console, 'error');
let page: MountedPage;

interface Post {
  readonly url: string;
  readonly body: FormData | undefined;
  readonly headers: Headers;
  readonly respond: (status: number, json: unknown) => void;
}
const posts: Post[] = [];
const navigations: string[] = [];
let restoreFetch: () => void;

function stubPlacePosts(): () => void {
  const original = window.fetch.bind(window);
  const spy = vi.spyOn(window, 'fetch').mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!new URL(url, location.href).pathname.startsWith('/checkout/'))
      return original(input, init);
    return new Promise<Response>((resolve) => {
      posts.push({
        url,
        body: init?.body instanceof FormData ? init.body : undefined,
        headers: new Headers(init?.headers),
        respond: (status, json) => {
          resolve(Response.json(json, { status }));
        },
      });
    });
  });
  return () => {
    spy.mockRestore();
  };
}

const checkout = () => {
  const el = page.root.querySelector('shop-checkout');
  if (el === null) throw new Error('no shop-checkout');
  return el as HTMLElement & { drivers: Record<string, unknown> };
};
// Works whether the checkout renders in shadow or light DOM (ADR 0006 moves it to light DOM).
const scope = (): ParentNode => checkout().shadowRoot ?? checkout();
const placeForm = () => {
  const form = scope().querySelector<HTMLFormElement>('form:has([name="terms"])');
  if (form === null) throw new Error('no place-order form');
  return form;
};
const nextPost = async (): Promise<Post> => {
  await vi.waitFor(() => {
    expect(posts.length).toBeGreaterThan(0);
  });
  const post = posts.shift();
  if (post === undefined) throw new Error('no post');
  return post;
};

beforeAll(async () => {
  page = mountSsrPage(reviewHtml);
  restoreFetch = stubPlacePosts();
  await import('../../src/client/entry.js');
  await hydrated(page.root);
  // Record navigations instead of leaving the test page (src/ui/drivers/location.ts).
  checkout().drivers = {
    location: {
      name: 'location',
      run: (url: string) => {
        navigations.push(url);
        return undefined;
      },
    },
  };
});

afterAll(() => {
  restoreFetch();
  page.unmount();
});

describe('placing an order with JavaScript', () => {
  it('opens on the review step with the hidden place-order fields', () => {
    const form = placeForm();
    expect(form.querySelector<HTMLInputElement>('[name="key"]')?.value).toBe('test-place-key');
    expect(form.querySelector<HTMLInputElement>('[name="expectedTotal"]')?.value).toMatch(/^\d+$/);
    expect(errors).not.toHaveBeenCalled();
  });

  it('requires the terms in the browser before posting', async () => {
    placeForm().requestSubmit();
    await vi.waitFor(() => {
      expect(scope().querySelector('[aria-invalid="true"], [id$="terms-error"]')).not.toBeNull();
    });
    expect(posts).toHaveLength(0);
  });

  it('posts through submitForm with the CSRF header and goes to the confirmation page', async () => {
    const terms = placeForm().querySelector<HTMLInputElement>('[name="terms"]');
    if (terms === null) throw new Error('no terms checkbox');
    terms.checked = true;
    placeForm().requestSubmit();
    const post = await nextPost();
    expect(new URL(post.url, location.href).pathname).toBe('/checkout/place');
    expect(post.headers.get('x-csrf-token')).toBe('test-csrf-token');
    expect(post.headers.get('accept')).toContain('application/json');
    expect(post.body?.get('key')).toBe('test-place-key');
    expect(post.body?.get('terms')).toBe('on');
    post.respond(200, placed);
    await vi.waitFor(() => {
      expect(navigations).toEqual(['/order/GG-20261004-TEST/confirmation']);
    });
  });

  it('follows the server back to the payment step when the card is declined', async () => {
    placeForm().requestSubmit();
    const post = await nextPost();
    post.respond(200, declined);
    await vi.waitFor(() => {
      expect(navigations.at(-1)).toBe('/checkout?edit=payment');
    });
    expect(errors).not.toHaveBeenCalled();
  });
});

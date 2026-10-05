// ORDER IS LOAD-BEARING: hydrate support before anything that imports Lit (Gyral ADR 0012).
import '@gyral/ssr/hydrate';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import serverHtml from '../fixtures/checkout.ssr.html?raw';
import shippingView from '../fixtures/checkout-shipping.json';
import paymentView from '../fixtures/checkout-payment.json';
import { a11yViolations } from '../support/axe.js';
import { hydrated, mountSsrPage, type MountedPage } from '../support/page.js';

const errors = vi.spyOn(console, 'error');
let page: MountedPage;

interface Post {
  readonly url: string;
  readonly body: FormData | undefined;
  readonly headers: Headers;
  readonly respond: (status: number, json: unknown) => void;
}
const posts: Post[] = [];
let restoreFetch: () => void;

/** Holds every /checkout/* request until the test answers it with a server response. */
function stubCheckoutPosts(): () => void {
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

// <shop-checkout> renders in light DOM (ADR 0006 rule 5).
const root = (): HTMLElement => {
  const found = page.root.querySelector<HTMLElement>('shop-checkout');
  if (found === null) throw new Error('no shop-checkout');
  return found;
};
const openStep = () => root().querySelector('[aria-current="step"]')?.getAttribute('data-step');
const input = (name: string) => {
  const found = root().querySelector<HTMLInputElement>(`[aria-current="step"] [name="${name}"]`);
  if (found === null) throw new Error(`no input ${name}`);
  return found;
};
const select = (name: string) => {
  const found = root().querySelector<HTMLSelectElement>(
    `[aria-current="step"] select[name="${name}"]`,
  );
  if (found === null) throw new Error(`no select ${name}`);
  return found;
};
const submitOpen = () => {
  const form = root().querySelector<HTMLFormElement>('[aria-current="step"] form');
  if (form === null) throw new Error('no open form');
  form.requestSubmit();
};
const errorFor = (intent: string, name: string) =>
  root().querySelector(`#${intent}-${name}-error`)?.textContent.trim();
const nextPost = async (): Promise<Post> => {
  await vi.waitFor(() => {
    expect(posts.length).toBeGreaterThan(0);
  });
  const post = posts.shift();
  if (post === undefined) throw new Error('no post');
  return post;
};

beforeAll(() => {
  page = mountSsrPage(serverHtml);
  restoreFetch = stubCheckoutPosts();
});

afterAll(() => {
  restoreFetch();
  page.unmount();
});

describe('checkout', () => {
  it('paints the server-rendered checkout before any component code loads', () => {
    expect(customElements.get('shop-checkout')).toBeUndefined();
    expect(openStep()).toBe('address');
    expect(root().querySelector('[data-step="contact"] .step-summary')?.textContent).toContain(
      'ada@example.com',
    );
  });

  it('hydrates in place without a mismatch or a request, keeping input typed before', async () => {
    expect(root().shadowRoot).toBeNull();
    const form = root().querySelector('[aria-current="step"] form');
    const name = input('name');
    name.value = 'Typed before the script loaded';
    await import('../../src/client/entry.js');
    await hydrated(page.root);
    expect(customElements.get('shop-checkout')).toBeDefined();
    expect(root().querySelector('[aria-current="step"] form')).toBe(form);
    expect(input('name')).toBe(name);
    expect(input('name').value).toBe('Typed before the script loaded');
    expect(posts).toHaveLength(0);
    expect(errors).not.toHaveBeenCalled();
  });

  it('validates the address in the browser before posting anything', async () => {
    input('name').value = 'Ada Lovelace';
    input('line1').value = '1 Analytical Way';
    input('postalCode').value = '12';
    submitOpen();
    await vi.waitFor(() => {
      expect(errorFor('Address', 'city')).toBe('Enter the city.');
      expect(errorFor('Address', 'postalCode')).toBe('Enter a 5-digit ZIP code.');
    });
    expect(input('city').getAttribute('aria-invalid')).toBe('true');
    expect(posts).toHaveLength(0);
  });

  it('posts a valid step with the CSRF header and opens the next step from the answer', async () => {
    input('city').value = 'Albany';
    select('state').value = 'NY';
    input('postalCode').value = '12207';
    submitOpen();
    const post = await nextPost();
    expect(new URL(post.url, location.href).pathname).toBe('/checkout/address');
    expect(post.headers.get('x-csrf-token')).toBe('test-csrf-token');
    expect(post.body?.get('city')).toBe('Albany');
    post.respond(200, shippingView);
    await vi.waitFor(() => {
      expect(openStep()).toBe('shipping');
    });
    expect(root().querySelector('[role="status"]')?.textContent).toContain('Shipping method');
    expect(root().querySelector('[data-step="address"] address')?.textContent).toContain('Albany');
  });

  it('opens a saved step for editing in place, without navigating', async () => {
    const edit = root().querySelector<HTMLAnchorElement>(
      '[data-step="contact"] a[data-step="contact"]',
    );
    edit?.click();
    await vi.waitFor(() => {
      expect(openStep()).toBe('contact');
    });
    expect(input('email').value).toBe('ada@example.com');
    expect(location.search).not.toContain('edit=');
  });

  it('shows card errors from the browser check and from the server', async () => {
    // Back to the server's open step (shipping), submit it, get the payment step.
    const host = root() as HTMLElementTagNameMap['shop-checkout'];
    host.send({ _tag: 'Edit', step: 'shipping' });
    await vi.waitFor(() => {
      expect(openStep()).toBe('shipping');
    });
    submitOpen();
    (await nextPost()).respond(200, paymentView);
    await vi.waitFor(() => {
      expect(openStep()).toBe('payment');
    });

    input('number').value = '4242 4242 4242 4241';
    input('expiry').value = '13/20';
    input('cvc').value = '1';
    submitOpen();
    await vi.waitFor(() => {
      expect(errorFor('Payment', 'number')).toBe('Enter a valid card number.');
      expect(errorFor('Payment', 'expiry')).toBe('Enter the expiry date as MM/YY.');
      expect(errorFor('Payment', 'cvc')).toBe('Enter the 3-digit security code.');
    });
    expect(posts).toHaveLength(0);

    input('number').value = '4242 4242 4242 4242';
    input('expiry').value = '12/30';
    input('cvc').value = '123';
    submitOpen();
    (await nextPost()).respond(422, {
      _tag: 'IntentRejected',
      intent: 'Payment',
      issues: [{ path: '', message: 'We couldn’t check this card. Please try again.' }],
    });
    await vi.waitFor(() => {
      expect(root().querySelector('[aria-current="step"] [role="alert"]')?.textContent).toContain(
        'We couldn’t check this card.',
      );
    });
  });

  it('has no accessibility violations', async () => {
    expect(await a11yViolations(page.root)).toEqual([]);
  });
});

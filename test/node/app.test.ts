import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app.js';

const app = createApp({ clientEntry: '/src/client/entry.ts' });
const get = (path: string) => app.request(path);

describe('walking skeleton', () => {
  it('server-renders the home page with the header as Declarative Shadow DOM', async () => {
    const res = await get('/');
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('<title>Gyral Goods</title>');
    expect(body).toContain('<shop-header');
    expect(body).toContain('shadowrootmode="open"');
    expect(body).toMatch(/href="\/d\/(<!--[^>]*-->)*electronics"/);
    expect(body).toContain('<script type="module" src="/src/client/entry.ts"></script>');
  });

  it('answers unknown paths with a 404 page that is not indexed', async () => {
    const res = await get('/no/such/page');
    const body = await res.text();
    expect(res.status).toBe(404);
    expect(body).toContain('We couldn');
    expect(body).toContain('<meta name="robots" content="noindex"');
  });

  it('answers failures with a 500 page and no error details', async () => {
    const failing = createApp({ clientEntry: '/x.ts' });
    failing.get('/boom', () => {
      throw new Error('secret detail');
    });
    const original = console.error;
    console.error = () => undefined;
    const res = await failing.request('/boom');
    console.error = original;
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(body).toContain('Something went wrong');
    expect(body).not.toContain('secret detail');
  });
});

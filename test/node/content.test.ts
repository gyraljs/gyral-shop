// Content pages, the contact form and error pages (docs/product-specs/content.md, seo.md).
import { describe, expect, it, vi } from 'vitest';
import { outbox } from '../../src/db/schema.js';
import { SUPPORT_ADDRESS } from '../../src/services/mail.js';
import { testApp } from '../support/app.js';
import { stableHtml } from '../support/fixtures.js';
import { guest } from '../support/auth.js';

const MESSAGE = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  topic: 'order',
  message: 'Where is my analytical engine?',
};

describe('static pages', () => {
  it.each([
    ['/about', 'About Gyral Goods'],
    ['/faq', 'Frequently asked questions'],
    ['/terms', 'Terms of use'],
    ['/privacy', 'Privacy'],
  ])('%s is indexable, canonical and semantic', async (path, heading) => {
    const test = await testApp();
    const res = await test.get(path);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`<link rel="canonical" href="http://localhost${path}"`);
    expect(html).not.toContain('content="noindex"');
    expect(html).toMatch(new RegExp(`<h1 id="title">(<!--[^>]*-->)?${heading}`));
    expect(html).toContain('data-region="content"');
  });

  it('renders the FAQ as an exclusive <details> accordion', async () => {
    const html = await (await testApp()).html('/faq');
    expect(html.match(/<details name="faq">/g)?.length).toBeGreaterThanOrEqual(5);
  });
});

describe('contact form', () => {
  it('rejects an invalid message with field errors', async () => {
    const test = await testApp();
    const res = await (
      await guest(test)
    ).postForm('/contact', { ...MESSAGE, topic: 'x', message: 'hi' });
    const html = await res.text();
    expect(res.status).toBe(422);
    expect(html).toContain('Choose a topic.');
    expect(html).toContain('Write at least 10 characters.');
    expect(html).toMatch(/>\n?hi<\/textarea>/); // the typed message comes back
  });

  it('keeps a typed message with markup characters escaped', async () => {
    const test = await testApp();
    const res = await (
      await guest(test)
    ).postForm('/contact', {
      ...MESSAGE,
      topic: 'nope',
      message: '<script>alert(1)</script> & more text here',
    });
    const html = await res.text();
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; more text here</textarea>');
    expect(html).not.toContain('<script>alert(1)</script>');
    // Golden file for the browser test (CSRF token pinned).
    const token = /csrf-token="([^"]+)"/.exec(html)?.[1] ?? '';
    await expect(stableHtml(html.replaceAll(token, 'test-csrf-token'))).toMatchFileSnapshot(
      '../fixtures/contact-rejected.ssr.html',
    );
  });

  it('sends the message to the support outbox and redirects', async () => {
    const test = await testApp();
    const res = await (await guest(test)).postForm('/contact', MESSAGE);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/contact/sent');
    const [mail] = await test.db.select().from(outbox);
    expect(mail?.to).toBe(SUPPORT_ADDRESS);
    expect(mail?.subject).toBe('Contact form: An order');
    expect(mail?.text).toContain('Where is my analytical engine?');
  });

  it('answers the JS path as JSON', async () => {
    const test = await testApp();
    const res = await (await guest(test)).submitForm('/contact', MESSAGE);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ _tag: 'Redirected', location: '/contact/sent' });
  });

  it('rate-limits per IP with the form re-rendered', async () => {
    const test = await testApp();
    let last = new Response();
    for (let n = 0; n < 6; n += 1) last = await (await guest(test)).postForm('/contact', MESSAGE);
    expect(last.status).toBe(429);
    const html = await last.text();
    expect(html).toContain('<shop-contact-form');
    expect(html).toContain('Too many attempts');
  });
});

describe('error pages', () => {
  it('404 offers search and every department', async () => {
    const test = await testApp();
    const res = await test.get('/no/such/page');
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain('action="/search"');
    const region = html.slice(html.indexOf('data-region="error"'));
    expect(region.match(/href="\/d\//g)?.length ?? 0).toBeGreaterThanOrEqual(8);
  });

  it('500 hides the error but still offers search and departments', async () => {
    const test = await testApp();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    test.app.get('/__boom', () => {
      throw new Error('kaboom-secret-detail');
    });
    const res = await test.get('/__boom');
    const html = await res.text();
    quiet.mockRestore();
    expect(res.status).toBe(500);
    expect(html).not.toContain('kaboom-secret-detail');
    expect(html).toContain('action="/search"');
    const region = html.slice(html.indexOf('data-region="error"'));
    expect(region.match(/href="\/d\//g)?.length ?? 0).toBeGreaterThanOrEqual(8);
  });
});

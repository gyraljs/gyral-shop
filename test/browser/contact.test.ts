// ORDER IS LOAD-BEARING: hydrate support before anything that imports Lit (Gyral ADR 0012).
import '@gyral/ssr/hydrate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import rejectedHtml from '../fixtures/contact-rejected.ssr.html?raw';
import { a11yViolations } from '../support/axe.js';
import { hydrated, mountSsrPage, type MountedPage } from '../support/page.js';

const errors = vi.spyOn(console, 'error');
const warnings = vi.spyOn(console, 'warn');
let page: MountedPage | undefined;

afterEach(() => {
  page?.unmount();
  page = undefined;
});

describe('contact form after a rejection (no-JS render)', () => {
  it('hydrates in place keeping the typed message, errors and accessibility', async () => {
    page = mountSsrPage(rejectedHtml);
    const before = page.root.querySelector('textarea');
    await import('../../src/client/entry.js');
    await hydrated(page.root);
    const el = page.root.querySelector('shop-contact-form');
    expect(customElements.get('shop-contact-form')).toBeDefined();
    const textarea = el?.querySelector('textarea');
    expect(textarea).toBe(before); // light DOM hydrated in place, not re-rendered
    expect(textarea?.value).toBe('<script>alert(1)</script> & more text here');
    expect(el?.querySelector('#shop-contact-form-topic-error')?.textContent).toBe(
      'Choose a topic.',
    );
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
    expect(await a11yViolations(page.root)).toEqual([]);
  });
});

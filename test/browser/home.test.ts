import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import serverHtml from '../fixtures/home.ssr.html?raw';
import { a11yViolations } from '../support/axe.js';
import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';

const errors = vi.spyOn(console, 'error');
const warnings = vi.spyOn(console, 'warn');
let page: MountedSsr;

const header = () => {
  const el = page.root.querySelector('shop-header');
  if (el === null) throw new Error('no header');
  return el;
};

beforeAll(() => {
  page = mountSsr(serverHtml);
});

afterAll(() => {
  page.unmount();
});

describe('home page', () => {
  it('paints the server markup before any component code loads', () => {
    expect(customElements.get('shop-header')).toBeUndefined();
    expect(header().querySelectorAll('nav.departments a')).toHaveLength(8);
    expect(page.root.querySelectorAll('.product-card').length).toBeGreaterThan(8);
  });

  it('hydrates in place with no mismatch', async () => {
    const link = header().querySelector('nav.departments a');
    await import('../../src/client/entry.js');
    await hydrated(page);
    expect(header().querySelector('nav.departments a')).toBe(link);
    expect(header().hasAttribute('data-gyral-seed')).toBe(false);
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    expect(await a11yViolations(page.root)).toEqual([]);
  });
});

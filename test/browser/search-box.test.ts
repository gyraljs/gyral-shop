// <shop-search>: header suggestions as an accessible combobox (search spec). Drivers are fakes:
// timers fire at once, HTTP answers from a fixture, navigation is recorded.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeDriver } from '@gyral/testing';
import { SearchBox } from '../../src/ui/layout/search-box.js';
import type { Suggestions } from '../../src/ui/layout/suggestions.js';
import { a11yViolations } from '../support/axe.js';

const answer: Suggestions = {
  query: 'kit',
  departments: [{ name: 'Home & Kitchen', href: '/d/home-kitchen' }],
  categories: [{ name: 'Kitchen', department: 'Home & Kitchen', href: '/c/home-kitchen/kitchen' }],
  products: [
    { name: 'Kettle', brand: 'Oak & Iron', href: '/p/kettle-1', price: '$24.00' },
    { name: 'Kitchen scale', brand: 'Measura', href: '/p/scale-2', price: '$12.50' },
  ],
};

async function mount() {
  const el = new SearchBox();
  // Answers for whatever was asked, like the real endpoint (stale answers are ignored).
  const http = fakeDriver<{ url: string }>('http', {
    impl: (req) => ({
      ...answer,
      query: new URL(req.url, location.origin).searchParams.get('q') ?? '',
    }),
  });
  const time = fakeDriver('time', { impl: () => undefined });
  const nav = fakeDriver<string>('location', { impl: () => undefined });
  el.drivers = { http, time, location: nav };
  document.body.append(el);
  // Live in the browser: the combobox and its list appear after Gyral's Hydrated message.
  await vi.waitFor(() => {
    expect(el.state.enhanced).toBe(true);
  });
  await el.updateComplete;
  const input = el.querySelector('input[name="q"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('no search field');
  const list = el.querySelector('[role="listbox"]');
  if (!(list instanceof HTMLElement)) throw new Error('no listbox');
  const type = async (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await vi.waitFor(() => {
      expect(el.state.status).toBe('idle');
      expect(el.state.open).toBe(true);
    });
    await el.updateComplete;
  };
  const key = async (k: string) => {
    const event = new KeyboardEvent('keydown', {
      key: k,
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    input.dispatchEvent(event);
    await el.updateComplete;
    return event;
  };
  const options = () => [...list.querySelectorAll('[role="option"]')];
  return { el, http, location: nav, input, list, type, key, options };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('<shop-search>', () => {
  it('keeps the plain GET form and becomes a closed combobox once live', async () => {
    const { el, input, list } = await mount();
    const form = el.querySelector('form');
    expect(form?.getAttribute('action')).toBe('/search');
    expect(form?.getAttribute('method')).toBe('get');
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(list.hidden).toBe(true);
  });

  it('shows departments, categories, then products from one request for the typed query', async () => {
    const { http, input, type, options } = await mount();
    await type('kit');
    expect(http.inputs.map((r) => r.url)).toEqual(['/api/search/suggest?q=kit']);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(options().map((o) => o.querySelector('.label')?.textContent)).toEqual([
      'Home & Kitchen',
      'Kitchen',
      'Kettle',
      'Kitchen scale',
    ]);
  });

  it('does not ask for one-letter queries', async () => {
    const { el, http, input } = await mount();
    input.value = 'k';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(http.inputs).toEqual([]);
  });

  it('moves the highlight with the arrow keys and opens it with Enter', async () => {
    const { el, location, input, type, key } = await mount();
    await type('kit');
    const down = await key('ArrowDown');
    expect(down.defaultPrevented).toBe(true);
    await key('ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe('search-option-1');
    await key('ArrowUp');
    await key('ArrowUp'); // wraps to the last option
    expect(el.state.highlighted).toBe(3);
    el.querySelector('form')?.requestSubmit();
    await vi.waitFor(() => {
      expect(location.inputs).toEqual(['/p/scale-2']);
    });
  });

  it('searches for the typed text when nothing is highlighted', async () => {
    const { el, location, type } = await mount();
    await type('kit');
    el.querySelector('form')?.requestSubmit();
    await vi.waitFor(() => {
      expect(location.inputs).toEqual(['/search?q=kit']);
    });
  });

  it('opens a suggestion on click', async () => {
    const { location, type, options } = await mount();
    await type('kit');
    (options()[1] as HTMLElement).click();
    await vi.waitFor(() => {
      expect(location.inputs).toEqual(['/c/home-kitchen/kitchen']);
    });
  });

  it('closes on Escape and when focus leaves the field', async () => {
    const { el, input, type, key, list } = await mount();
    await type('kit');
    const esc = await key('Escape');
    expect(esc.defaultPrevented).toBe(false);
    expect(list.hidden).toBe(true);
    await type('kitc');
    input.focus();
    input.blur();
    await vi.waitFor(() => {
      expect(el.state.open).toBe(false);
    });
  });

  it('has no accessibility violations while open', async () => {
    const { el, type } = await mount();
    await type('kit');
    expect(await a11yViolations(el)).toEqual([]);
  });
});

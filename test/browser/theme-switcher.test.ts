// <shop-theme-switcher> with JavaScript (ADR 0006 rule 8): picking a theme swaps the theme
// stylesheet in place (no reload), inside a View Transition unless reduced motion is preferred,
// and saves the choice with submitForm. HTTP is a fake; the stylesheets are real (blob URLs).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDriver } from '@gyral/testing';
import { THEME_LINK_ID, swapThemeLink } from '../../src/ui/theme/link-driver.js';
import { ThemeSwitcher, type ThemeChoice } from '../../src/ui/theme/switcher.js';
import { baseCss } from '../../src/ui/styles/base.js';
import { themeSwitcherCss } from '../../src/ui/styles/theme-switcher.js';
import { a11yViolations } from '../support/axe.js';

const style = document.createElement('style');
style.textContent = `${baseCss}${themeSwitcherCss}`;
document.head.append(style);

const sheet = (brand: string) =>
  URL.createObjectURL(
    new Blob([`@layer theme { :root { --brand: ${brand}; } }`], { type: 'text/css' }),
  );

let themes: ThemeChoice[];

const brand = () => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();

async function linkTheme(href: string): Promise<void> {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.id = THEME_LINK_ID;
  link.href = href;
  const loaded = new Promise((resolve) => {
    link.addEventListener('load', resolve, { once: true });
  });
  document.head.append(link);
  await loaded;
}

interface Sent {
  readonly url: string;
  readonly body?: unknown;
}

async function mount(answer: () => unknown = () => ({ _tag: 'Redirected', location: '/d/books' })) {
  const el = new ThemeSwitcher();
  el.themes = themes;
  el.current = 'house';
  el.returnTo = '/d/books';
  const http = fakeDriver<Sent>('http', { impl: answer });
  el.drivers = { http };
  document.body.append(el);
  await el.updateComplete;
  await vi.waitFor(() => {
    expect(el.state.enhanced).toBe(true);
  });
  await el.updateComplete;
  const radio = (label: string) => {
    const found = [...el.querySelectorAll('label')].find((l) => l.textContent.trim() === label);
    const input = found?.querySelector('input');
    if (!(input instanceof HTMLInputElement)) throw new Error(`no radio ${label}`);
    return input;
  };
  return { el, http, radio };
}

/** Every theme link, including any left by another test in this document. */
const removeThemeLinks = () => {
  for (const link of document.querySelectorAll(`link#${THEME_LINK_ID}, link[data-theme]`))
    link.remove();
};

beforeEach(async () => {
  removeThemeLinks();
  themes = [
    { name: 'house', label: 'House', href: sheet('rgb(200, 0, 0)') },
    { name: 'night', label: 'Night', href: sheet('rgb(0, 0, 200)') },
  ];
  await linkTheme(themes[0]?.href ?? '');
});

afterEach(() => {
  document.body.replaceChildren();
  removeThemeLinks();
  vi.restoreAllMocks();
});

describe('<shop-theme-switcher>', () => {
  it('is a labelled fieldset of radios with the current theme checked', async () => {
    const { el, radio } = await mount();
    expect(el.querySelector('fieldset legend')?.textContent).toBe('Theme');
    expect(radio('House').checked).toBe(true);
    // Hydrated: themes apply on change, so the Apply button hides.
    expect(el.querySelector<HTMLButtonElement>('button[type="submit"]')?.hidden).toBe(true);
    expect(await a11yViolations(el)).toEqual([]);
  });

  it('swaps the stylesheet in place and saves the choice, without a reload', async () => {
    const { el, http, radio } = await mount();
    const before = performance.getEntriesByType('navigation').length;
    expect(brand()).toBe('rgb(200, 0, 0)');
    radio('Night').click();
    await vi.waitFor(() => {
      expect(brand()).toBe('rgb(0, 0, 200)');
    });
    const links = document.querySelectorAll(`link#${THEME_LINK_ID}`);
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe(themes[1]?.href);
    await vi.waitFor(() => {
      expect(el.querySelector('[role="status"]')?.textContent).toBe('Theme changed to Night.');
    });
    const [sent] = http.inputs;
    expect(sent?.url).toBe('/theme');
    expect(sent?.body).toBeInstanceOf(FormData);
    const body = sent?.body as FormData;
    expect(body.get('theme')).toBe('night');
    expect(body.get('return')).toBe('/d/books');
    expect(performance.getEntriesByType('navigation')).toHaveLength(before);
  });

  it('keeps the new look but says so when saving fails', async () => {
    const { el, radio } = await mount(() => {
      throw new Error('offline');
    });
    radio('Night').click();
    await vi.waitFor(() => {
      expect(el.querySelector('[role="status"]')?.textContent).toContain('could not be saved');
    });
    expect(brand()).toBe('rgb(0, 0, 200)');
  });
});

describe('swapThemeLink', () => {
  it('uses a View Transition when motion is allowed', async () => {
    const transition = vi.spyOn(document, 'startViewTransition');
    await swapThemeLink({ name: 'night', href: themes[1]?.href ?? '' });
    expect(transition).toHaveBeenCalledTimes(1);
    expect(brand()).toBe('rgb(0, 0, 200)');
  });

  it('skips the transition when reduced motion is preferred', async () => {
    const real = window.matchMedia.bind(window);
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) =>
      query.includes('prefers-reduced-motion')
        ? // Only `matches` is read (link-driver.ts prefersReducedMotion).
          ({ matches: true, media: query } as unknown as MediaQueryList)
        : real(query),
    );
    const transition = vi.spyOn(document, 'startViewTransition');
    await swapThemeLink({ name: 'night', href: themes[1]?.href ?? '' });
    expect(transition).not.toHaveBeenCalled();
    expect(brand()).toBe('rgb(0, 0, 200)');
  });

  it('keeps the current theme if the new stylesheet fails to load', async () => {
    await swapThemeLink({ name: 'broken', href: '/no-such-theme.css' });
    expect(brand()).toBe('rgb(200, 0, 0)');
    expect(document.querySelectorAll(`link#${THEME_LINK_ID}`)).toHaveLength(1);
  });
});

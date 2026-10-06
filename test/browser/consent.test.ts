// <shop-consent> with JavaScript: the same form is sent with submitForm, the banner closes in
// place (settings page: confirms instead). HTTP is a fake recording what was sent.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeDriver } from '@gyral/testing';
import { ConsentBox } from '../../src/ui/consent/consent.js';
import { baseCss } from '../../src/ui/styles/base.js';
import { defaultThemeCss } from '../../src/ui/themes/default.css.js';
import { consentCss } from '../../src/ui/styles/consent.js';
import { a11yViolations } from '../support/axe.js';
import { settled } from '@gyral/core';

// Light DOM: the component is styled by document CSS, as on a real page.
const style = document.createElement('style');
style.textContent = `${baseCss}${consentCss}${defaultThemeCss}`;
document.head.append(style);

interface Sent {
  readonly url: string;
  readonly body?: unknown;
}

async function mount(
  mode: 'banner' | 'page',
  answer: () => unknown = () => ({ _tag: 'Redirected', location: '/' }),
) {
  const el = new ConsentBox();
  el.mode = mode;
  el.returnTo = '/d/books';
  const http = fakeDriver<Sent>('http', { impl: answer });
  el.drivers = { http };
  document.body.append(el);
  await settled();
  const button = (name: string) => {
    const found = [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === name);
    if (found === undefined) throw new Error(`no button ${name}`);
    return found;
  };
  return { el, http, button };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('<shop-consent>', () => {
  it('is a labelled, non-modal region with three choices', async () => {
    const { el } = await mount('banner');
    const region = el.querySelector('section[data-region="consent"]');
    expect(region?.getAttribute('aria-labelledby')).toBe('consent-title');
    expect(el.querySelector('[aria-modal], dialog')).toBeNull();
    expect(await a11yViolations(el)).toEqual([]);
  });

  it('sends the pressed button with the form and closes the banner', async () => {
    const { el, http, button } = await mount('banner');
    button('Reject non-essential').click();
    await vi.waitFor(() => {
      expect(el.querySelector('section')).toBeNull();
    });
    const [sent] = http.inputs;
    expect(sent?.url).toBe('/consent');
    const body = sent?.body;
    expect(body instanceof FormData ? body.get('choice') : undefined).toBe('reject');
    expect(body instanceof FormData ? body.get('return') : undefined).toBe('/d/books');
  });

  it('sends the custom choice from the Customize panel', async () => {
    const { http, el, button } = await mount('banner');
    const details = el.querySelector('details');
    if (details !== null) details.open = true;
    const box = el.querySelector('input[name="analytics"]');
    if (box instanceof HTMLInputElement) box.checked = true;
    button('Save choices').click();
    await vi.waitFor(() => {
      expect(http.inputs).toHaveLength(1);
    });
    const body = http.inputs[0]?.body;
    expect(body instanceof FormData ? [body.get('choice'), body.get('analytics')] : []).toEqual([
      'save',
      'on',
    ]);
  });

  it('stays open and says so when saving fails', async () => {
    const { el, button } = await mount('banner', () => {
      throw new Error('offline');
    });
    button('Accept all').click();
    await vi.waitFor(() => {
      expect(el.querySelector('[role="status"]')?.textContent).toContain('could not be saved');
    });
    expect(el.querySelector('section')).not.toBeNull();
  });

  it('confirms on the settings page instead of closing', async () => {
    const { el, button } = await mount('page');
    button('Accept all').click();
    await vi.waitFor(() => {
      expect(el.querySelector('[role="status"]')?.textContent).toBe('Your choices are saved.');
    });
  });
});

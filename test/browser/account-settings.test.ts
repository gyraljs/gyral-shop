// ORDER IS LOAD-BEARING: hydrate support before anything that imports Lit (Gyral ADR 0012).
import '@gyral/ssr/hydrate';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeDriver } from '@gyral/testing';
import type { HttpRequest } from '@gyral/http';
import addressesHtml from '../fixtures/addresses.ssr.html?raw';
import { locationDriver } from '../../src/ui/drivers/location.js';
import { a11yViolations } from '../support/axe.js';
import { hydrated, mountSsrPage, type MountedPage } from '../support/page.js';

const errors = vi.spyOn(console, 'error');
const warnings = vi.spyOn(console, 'warn');
let page: MountedPage | undefined;

beforeAll(async () => {
  const first = mountSsrPage(addressesHtml);
  await import('../../src/client/entry.js');
  await hydrated(first.root);
  first.unmount();
});

afterEach(() => {
  page?.unmount();
  page = undefined;
});

async function mountAddressForm() {
  page = mountSsrPage(addressesHtml);
  const before = page.root.querySelector('shop-address-form input[name="line1"]');
  await hydrated(page.root);
  const el = page.root.querySelector('shop-address-form');
  if (el === null) throw new Error('no shop-address-form');
  const http = fakeDriver<HttpRequest>('http');
  const location = fakeDriver(locationDriver, { impl: () => undefined });
  el.drivers = { http, location };
  const field = (name: string) => {
    const control = el.querySelector(`[name="${name}"]`);
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) {
      throw new Error(`no field ${name}`);
    }
    return control;
  };
  const submit = async () => {
    el.querySelector('form')?.requestSubmit();
    await el.updateComplete;
  };
  return { el, before, http, location, field, submit };
}

describe('address book', () => {
  it('hydrates in place (light DOM) without errors or axe violations', async () => {
    const { el, before } = await mountAddressForm();
    // Light DOM hydrates in place: the server's input is the same node afterwards.
    expect(el.querySelector('input[name="line1"]')).toBe(before);
    expect(el.shadowRoot).toBeNull();
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
    expect(await a11yViolations(page?.root ?? document.body)).toEqual([]);
  });

  it('validates in the browser first: an invalid ZIP never reaches the server', async () => {
    const { http, field, submit } = await mountAddressForm();
    field('name').value = 'Ada Lovelace';
    field('line1').value = '1 Main St';
    field('city').value = 'Albany';
    field('state').value = 'NY';
    field('postalCode').value = '12';
    await submit();
    await vi.waitFor(() => {
      expect(field('postalCode').validationMessage).toBe('Enter a 5-digit ZIP code.');
    });
    expect(http.inputs).toEqual([]);
  });

  it('posts a valid address with the CSRF header and follows the redirect', async () => {
    const { http, location, field, submit } = await mountAddressForm();
    field('name').value = 'Ada Lovelace';
    field('line1').value = '1 Main St';
    field('city').value = 'Austin';
    field('state').value = 'TX';
    field('postalCode').value = '78701';
    await submit();
    await vi.waitFor(() => {
      expect(http.inputs).toHaveLength(1);
    });
    expect(http.inputs[0]).toMatchObject({
      url: '/account/addresses',
      method: 'POST',
      headers: { 'x-csrf-token': 'test-csrf-token' },
    });
    http.resolveNext({ _tag: 'Redirected', location: '/account/addresses' });
    await vi.waitFor(() => {
      expect(location.inputs).toEqual(['/account/addresses']);
    });
  });
});

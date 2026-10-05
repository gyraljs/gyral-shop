// ORDER IS LOAD-BEARING: hydrate support before anything that imports Lit (Gyral ADR 0012).
import '@gyral/ssr/hydrate';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeDriver } from '@gyral/testing';
import type { HttpRequest } from '@gyral/http';
import loginHtml from '../fixtures/login.ssr.html?raw';
import rejectedHtml from '../fixtures/login-rejected.ssr.html?raw';
import registerHtml from '../fixtures/register.ssr.html?raw';
import { locationDriver } from '../../src/ui/drivers/location.js';
import { a11yViolations } from '../support/axe.js';
import { hydrated, mountSsr, type MountedSsr } from '@gyral/testing';

const errors = vi.spyOn(console, 'error');
const warnings = vi.spyOn(console, 'warn');
let page: MountedSsr | undefined;

beforeAll(async () => {
  // Components register once; later mounts upgrade on insertion.
  const first = mountSsr(loginHtml);
  await import('../../src/client/entry.js');
  await hydrated(first);
  first.unmount();
});

afterEach(() => {
  page?.unmount();
  page = undefined;
});

async function mount(html: string, tag: 'shop-login' | 'shop-register') {
  page = mountSsr(html);
  await hydrated(page);
  const el = page.root.querySelector(tag);
  if (el === null || el.shadowRoot === null) throw new Error(`no ${tag}`);
  const http = fakeDriver<HttpRequest>('http');
  const location = fakeDriver(locationDriver, { impl: () => undefined });
  el.drivers = { http, location };
  const field = (name: string) => {
    const input = el.shadowRoot?.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (input == null) throw new Error(`no field ${name}`);
    return input;
  };
  const submit = async () => {
    el.shadowRoot?.querySelector('form')?.requestSubmit();
    await vi.waitFor(() => el.updateComplete);
    await el.updateComplete;
  };
  const alert = () => el.shadowRoot?.querySelector('[role="alert"]')?.textContent.trim();
  return { el, http, location, field, submit, alert };
}

describe('sign-in page', () => {
  it('hydrates without errors and has no axe violations', async () => {
    page = mountSsr(loginHtml);
    await hydrated(page);
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
    expect(await a11yViolations(page.root)).toEqual([]);
  });

  it('submits the form with the CSRF header, shows a 422 rejection, then navigates', async () => {
    const { http, location, field, submit, alert } = await mount(loginHtml, 'shop-login');
    field('email').value = 'ada@example.com';
    field('password').value = 'wrong-password';
    await submit();
    await vi.waitFor(() => {
      expect(http.inputs).toHaveLength(1);
    });
    const sent = http.inputs[0];
    expect(sent).toMatchObject({
      url: '/account/login',
      method: 'POST',
      headers: { 'x-csrf-token': 'test-csrf-token' },
    });
    // The same FormData a no-JS post would send (Gyral submitForm).
    expect(sent?.body).toBeInstanceOf(FormData);
    const body = sent?.body as FormData;
    expect([body.get('email'), body.get('password')]).toEqual([
      'ada@example.com',
      'wrong-password',
    ]);
    const rejected = {
      _tag: 'IntentRejected',
      intent: 'Login',
      issues: [{ path: '', message: 'That email and password do not match an account.' }],
    };
    http.rejectNext({
      _tag: 'HttpStatusError',
      url: '/account/login',
      status: 422,
      statusText: '',
      body: rejected,
      detail: rejected,
    });
    await vi.waitFor(() => {
      expect(alert()).toBe('That email and password do not match an account.');
    });
    field('password').value = 'analytical-engine';
    await submit();
    await vi.waitFor(() => {
      expect(http.inputs).toHaveLength(2);
    });
    http.resolveNext({ _tag: 'Redirected', location: '/d/books' });
    await vi.waitFor(() => {
      expect(location.inputs).toEqual(['/d/books']);
    });
  });

  it('turns a rate limit into a form-level message', async () => {
    const { http, field, submit, alert } = await mount(loginHtml, 'shop-login');
    field('email').value = 'ada@example.com';
    field('password').value = 'whatever-it-is';
    await submit();
    await vi.waitFor(() => {
      expect(http.inputs).toHaveLength(1);
    });
    http.rejectNext({
      _tag: 'HttpStatusError',
      url: '/account/login',
      status: 429,
      statusText: '',
      body: undefined,
    });
    await vi.waitFor(() => {
      expect(alert()).toContain('Too many attempts');
    });
  });
});

describe('sign-in page after a wrong password (no-JS render)', () => {
  it('keeps the server-rendered error and email through hydration', async () => {
    const { el, field, alert } = await mount(rejectedHtml, 'shop-login');
    expect(alert()).toBe('That email and password do not match an account.');
    expect(field('email').value).toBe('ada@example.com');
    expect(field('password').value).toBe('');
    expect(el.state.errors['']).toEqual(['That email and password do not match an account.']);
    expect(errors).not.toHaveBeenCalled();
    expect(await a11yViolations(el)).toEqual([]);
  });
});

describe('registration page', () => {
  it('hydrates without errors and has no axe violations', async () => {
    page = mountSsr(registerHtml);
    await hydrated(page);
    expect(errors).not.toHaveBeenCalled();
    expect(await a11yViolations(page.root)).toEqual([]);
  });

  it('validates in the browser first: mismatched passwords never reach the server', async () => {
    const { http, field, submit } = await mount(registerHtml, 'shop-register');
    field('name').value = 'Grace Hopper';
    field('email').value = 'grace@example.com';
    field('password').value = 'cobol-compiler';
    field('confirm').value = 'cobol-compilr';
    await submit();
    await vi.waitFor(() => {
      expect(field('confirm').validationMessage).toBe('The passwords do not match.');
    });
    expect(field('confirm').getAttribute('aria-invalid')).toBe('true');
    expect(http.inputs).toEqual([]);
  });
});

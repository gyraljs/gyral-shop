// <shop-theme-switcher>: the footer's theme control (ADR 0006 rule 8). Light DOM.
// Without JavaScript it is a POST form to /theme that redirects back with the theme cookie set;
// the next page links the chosen stylesheet. With it, picking a theme swaps the stylesheet in
// place (View Transition when allowed) and saves the choice with submitForm.
import { changed, define, defineForm, form, html, prop, send, type Next } from '@gyral/core';
import { submitForm } from '@gyral/http';
import * as v from 'valibot';
import { loadedMe, meStore } from '../me/store.js';
import { swapTheme } from './link-driver.js';

/** One schema for the browser and the server's formAction (Gyral ADR 0008). */
export const ThemeForm = defineForm(
  v.object({
    theme: v.pipe(v.string(), v.regex(/^[a-z0-9-]{1,40}$/, 'Choose one of the listed themes.')),
    return: v.optional(v.pipe(v.string(), v.maxLength(2000))),
  }),
);

/** One choice, as the server describes it (src/server/theme.ts themeOptions). */
const ThemeChoiceSchema = v.object({ name: v.string(), label: v.string(), href: v.string() });
export type ThemeChoice = v.InferOutput<typeof ThemeChoiceSchema>;

export interface ThemeSwitcherProps {
  readonly themes: readonly ThemeChoice[];
  /** The visitor's theme; empty on prerendered pages, which ask `/api/me` after hydration. */
  readonly current?: string;
  /** Where the no-JS form returns to after saving. */
  readonly returnTo?: string;
  readonly deferred?: boolean;
}

export interface ThemeSwitcherState {
  readonly current: string;
  readonly saving: boolean;
  readonly message: string | null;
  /** Hydrated: themes apply on change, so the Apply button is not needed. */
  readonly enhanced: boolean;
}

export type ThemeSwitcherMsg =
  | { readonly _tag: 'Picked'; readonly name: string; readonly form: FormData }
  | { readonly _tag: 'Choose'; readonly form: FormData }
  | { readonly _tag: 'Applied' }
  | { readonly _tag: 'Saved' }
  | { readonly _tag: 'Failed' };

const formTheme = (data: FormData): string => {
  const value = data.get('theme');
  return typeof value === 'string' ? value : '';
};

const FAILED = 'Your theme could not be saved; it applies to this page only.';

function apply(
  s: ThemeSwitcherState,
  name: string,
  data: FormData,
  themes: readonly ThemeChoice[],
): Next<ThemeSwitcherState, ThemeSwitcherMsg> {
  const theme = themes.find((t) => t.name === name);
  if (theme === undefined || name === s.current) return s;
  return [
    { ...s, current: name, saving: true, message: null },
    [
      swapTheme<ThemeSwitcherMsg>({ name: theme.name, href: theme.href }, { _tag: 'Applied' }),
      submitForm<ThemeSwitcherMsg, ThemeSwitcherMsg>('/theme', data, {
        onSuccess: () => ({ _tag: 'Saved' }),
        onFailure: () => ({ _tag: 'Failed' }),
        key: 'theme',
      }),
    ],
  ];
}

export const ThemeSwitcher = define<ThemeSwitcherState, ThemeSwitcherMsg, ThemeSwitcherProps>()(
  'shop-theme-switcher',
  {
    stores: [meStore],
    shadow: false,
    props: {
      themes: prop.value(v.array(ThemeChoiceSchema), { required: true }),
      current: prop.string(),
      returnTo: prop.string(),
      deferred: prop.boolean(),
    },
    init: (props) => ({
      current: props.current ?? '',
      saving: false,
      message: null,
      enhanced: false,
    }),
    intent: {
      // A radio changed (JS only: without it, nothing listens and the Apply button submits).
      Picked: ({ event }) => {
        const radio = event.target;
        if (!(radio instanceof HTMLInputElement) || radio.form === null) return undefined;
        return { _tag: 'Picked', name: radio.value, form: new FormData(radio.form) };
      },
      Choose: form(ThemeForm, (_data, raw) => ({ _tag: 'Choose', form: raw })),
    },
    update: {
      Picked: (s, m, { props }) => apply(s, m.name, m.form, props.themes),
      Choose: (s, m, { props }) => apply(s, formTheme(m.form), m.form, props.themes),
      Applied: (s) => s,
      Saved: (s, _m, { props }) => {
        const label = props.themes.find((t) => t.name === s.current)?.label ?? s.current;
        return { ...s, saving: false, message: `Theme changed to ${label}.` };
      },
      Failed: (s) => ({ ...s, saving: false, message: FAILED }),
      // The server's 422 (no-JS re-render or JSON): show its message.
      IntentRejected: (s, m) => ({
        ...s,
        saving: false,
        message: m.issues[0]?.message ?? 'Choose one of the listed themes.',
      }),
      Hydrated: (s, _m, { props }) =>
        props.deferred === true
          ? [{ ...s, enhanced: true }, [send(meStore, { _tag: 'Load' })]]
          : { ...s, enhanced: true },
      // Prerendered pages: the visitor's theme arrives with /api/me.
      StoreChanged: (s, m, { read }) => {
        const theme = changed(meStore, m) ? loadedMe(read(meStore))?.theme : undefined;
        return theme === undefined || s.current !== '' ? s : { ...s, current: theme };
      },
    },
    view: (s, i, { props }) => html`
      <form
        method="post"
        action="/theme"
        class="theme-switcher"
        data-region="theme-switcher"
        data-intent=${i.Choose}
      >
        <fieldset data-intent=${i.Picked} data-intent-on="change">
          <legend>Theme</legend>
          ${props.themes.map(
            (t) =>
              html`<label data-component="theme-option">
                <input type="radio" name="theme" value=${t.name} ?checked=${s.current === t.name} />
                ${t.label}
              </label>`,
          )}
        </fieldset>
        <input type="hidden" name="return" value=${props.returnTo ?? '/'} />
        <button type="submit" ?hidden=${s.enhanced}>Apply theme</button>
        <p class="theme-status" role="status">${s.message}</p>
      </form>
    `,
  },
);

declare global {
  interface HTMLElementTagNameMap {
    'shop-theme-switcher': InstanceType<typeof ThemeSwitcher>;
  }
}

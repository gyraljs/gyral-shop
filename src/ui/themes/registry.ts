// The themes the shop ships, in switcher order (ADR 0006 rule 8). Server-only: the client
// never imports theme CSS; it receives names, labels and stylesheet URLs as props.
import { defaultTheme } from './default.css.js';
import { marketplaceTheme } from './marketplace.css.js';
import type { ThemeDefinition } from './theme.js';

export const THEMES: readonly ThemeDefinition[] = [defaultTheme, marketplaceTheme];

export const DEFAULT_THEME = defaultTheme.name;

export const findTheme = (name: string | undefined): ThemeDefinition | undefined =>
  THEMES.find((theme) => theme.name === name);

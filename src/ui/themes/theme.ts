// A theme is one stylesheet that writes only to @layer theme (ADR 0006 rules 7–8). Adding a
// theme: a new `<name>.css.ts` file exporting a ThemeDefinition, plus its line in registry.ts
// (test/node/theme-switcher.test.ts fails if a theme file isn't registered).

export interface ThemeDefinition {
  /** Cookie value and URL segment: lowercase letters, digits and dashes. */
  readonly name: string;
  /** Shown in the theme switcher. */
  readonly label: string;
  readonly description: string;
  /** The stylesheet; served as a cacheable file, never inlined. */
  readonly css: string;
}

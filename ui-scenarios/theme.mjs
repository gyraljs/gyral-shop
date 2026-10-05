// Theme switcher (ADR 0006 rule 8): the settings page, picking the current theme (a no-op
// swap) and the footer control on a regular page. More themes add more radios to check.
export default {
  path: '/theme',
  steps: [
    { waitFor: { role: 'group', name: 'Theme' } },
    { check: { role: 'radio', name: 'Gyral Goods' } },
    { goto: '/d/electronics' },
    { waitFor: { css: 'footer [data-region="theme-switcher"]' } },
  ],
};

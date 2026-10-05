// The biggest category, filtered to products on sale without a reload (with JS). Phones show
// the filters collapsed in a <details> panel, so open it there first.
export default {
  path: '{category}',
  steps: [
    { click: { css: '[data-component="filters-panel"] > summary' }, viewport: 'phone' },
    { check: { label: 'On sale' } },
    { wait: 800 },
  ],
};

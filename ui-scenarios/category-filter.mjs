// The biggest category, filtered to products on sale without a reload (with JS).
export default {
  path: '{category}',
  steps: [{ check: { label: 'On sale' } }, { wait: 800 }],
};

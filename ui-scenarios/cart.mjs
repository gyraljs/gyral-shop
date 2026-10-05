// Add a single-SKU product, then the cart page with its line and totals.
export default {
  path: '/p/{product}',
  steps: [{ click: { role: 'button', name: 'Add to cart' } }, { wait: 800 }, { goto: '/cart' }],
};

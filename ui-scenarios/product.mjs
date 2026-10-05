// A product with options: the buy box, gallery and reviews; add one to the cart.
export default {
  path: '/p/{variantProduct}',
  steps: [{ click: { role: 'button', name: 'Add to cart' } }, { wait: 800 }],
};

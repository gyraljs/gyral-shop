// Sign in, save a product from its page, then the wishlist.
export default {
  path: '/account/login',
  steps: [
    { fill: { label: 'Email' }, value: '{customer}' },
    { fill: { label: 'Password', exact: true }, value: '{password}' },
    { click: { role: 'button', name: 'Sign in' } },
    { wait: 800 },
    { goto: '/p/{product}' },
    { click: { css: '.product-wish button' } },
    { wait: 800 },
    { goto: '/account/wishlist' },
  ],
};
